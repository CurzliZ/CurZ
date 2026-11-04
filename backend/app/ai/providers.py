from dataclasses import dataclass
import hashlib
import re
import json
from typing import Any, Protocol
from urllib.parse import urlsplit, urlunsplit

import httpx


@dataclass(frozen=True)
class AIConfig:
    ollama_url: str
    chat_model: str
    embedding_model: str
    timeout_seconds: float
    demo_mode: bool = False


@dataclass(frozen=True)
class ChatResult:
    content: str
    model: str
    mock: bool


@dataclass(frozen=True)
class EmbeddingResult:
    embeddings: list[list[float]]
    model: str
    mock: bool


@dataclass(frozen=True)
class ProviderHealth:
    provider: str
    reachable: bool
    chat_model: str
    chat_model_present: bool
    embedding_model: str
    embedding_model_present: bool
    mock: bool
    error: str | None = None
    chat_model_error: str | None = None
    embedding_model_error: str | None = None


class AIProviderError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def normalize_ollama_url(url: str) -> str:
    parts = urlsplit(url)
    if parts.hostname and parts.hostname.casefold() == "localhost":
        userinfo = parts.netloc.rsplit("@", 1)[0] if "@" in parts.netloc else ""
        authority = f"{userinfo + '@' if userinfo else ''}127.0.0.1"
        if parts.port is not None:
            authority += f":{parts.port}"
        parts = parts._replace(netloc=authority)
    return urlunsplit(parts).rstrip("/")


class Provider(Protocol):
    async def chat(
        self, messages: list[dict[str, str]], json_schema: dict[str, Any] | None = None
    ) -> ChatResult: ...

    async def embed(self, texts: list[str]) -> EmbeddingResult: ...

    async def health(self) -> ProviderHealth: ...


def _provider_error(response: httpx.Response) -> AIProviderError:
    try:
        detail = str(response.json().get("error", ""))
    except (ValueError, AttributeError):
        detail = ""
    lowered = detail.lower()
    if response.status_code == 404 or (
        "model" in lowered and ("not found" in lowered or "pull" in lowered)
    ):
        return AIProviderError("model_missing", detail or "The requested Ollama model is not installed.")
    if any(term in lowered for term in ("out of memory", "cuda out of memory", "runner process has terminated")):
        return AIProviderError("out_of_memory", "Ollama ran out of memory while loading the model.")
    return AIProviderError("provider_error", detail or f"Ollama returned HTTP {response.status_code}.")


class OllamaProvider:
    def __init__(self, config: AIConfig):
        self.config = AIConfig(
            ollama_url=normalize_ollama_url(config.ollama_url),
            chat_model=config.chat_model,
            embedding_model=config.embedding_model,
            timeout_seconds=config.timeout_seconds,
            demo_mode=config.demo_mode,
        )

    async def _post(self, endpoint: str, payload: dict[str, Any]) -> httpx.Response:
        try:
            async with httpx.AsyncClient(timeout=self.config.timeout_seconds) as client:
                response = await client.post(f"{self.config.ollama_url}{endpoint}", json=payload)
        except httpx.TimeoutException as error:
            raise AIProviderError("timeout", "Ollama did not respond before the configured timeout.") from error
        except httpx.RequestError as error:
            raise AIProviderError("unreachable", "Could not reach Ollama at the configured URL.") from error
        if response.is_error:
            raise _provider_error(response)
        return response

    async def chat(
        self, messages: list[dict[str, str]], json_schema: dict[str, Any] | None = None
    ) -> ChatResult:
        if not self.config.chat_model:
            raise AIProviderError("model_missing", "Set an Ollama chat model in Settings.")
        payload: dict[str, Any] = {"model": self.config.chat_model, "messages": messages, "stream": False}
        if json_schema is not None:
            payload["format"] = json_schema
            payload["think"] = False
        response = await self._post("/api/chat", payload)
        try:
            content = response.json()["message"]["content"]
        except (ValueError, KeyError, TypeError) as error:
            raise AIProviderError("invalid_response", "Ollama returned an invalid chat response.") from error
        return ChatResult(str(content), self.config.chat_model, False)

    async def embed(self, texts: list[str]) -> EmbeddingResult:
        if not self.config.embedding_model:
            raise AIProviderError("model_missing", "Set an Ollama embedding model in Settings.")
        response = await self._post(
            "/api/embed", {"model": self.config.embedding_model, "input": texts}
        )
        try:
            embeddings = response.json()["embeddings"]
        except (ValueError, KeyError, TypeError) as error:
            raise AIProviderError("invalid_response", "Ollama returned invalid embeddings.") from error
        return EmbeddingResult(embeddings, self.config.embedding_model, False)

    async def health(self) -> ProviderHealth:
        message = ""
        try:
            async with httpx.AsyncClient(timeout=min(self.config.timeout_seconds, 5)) as client:
                response = await client.get(f"{self.config.ollama_url}/api/tags")
            response.raise_for_status()
            names = {str(model.get("name", "")) for model in response.json().get("models", [])}

            def installed(model: str) -> bool:
                return bool(model) and any(name == model or name.startswith(f"{model}:") for name in names)

        except httpx.TimeoutException:
            message = "Ollama did not respond within five seconds."
        except httpx.RequestError:
            message = "Could not reach Ollama at the configured URL."
        except (httpx.HTTPStatusError, ValueError, TypeError, AttributeError):
            message = "Ollama returned an invalid health response."
        else:
            chat_present = installed(self.config.chat_model)
            embedding_present = installed(self.config.embedding_model)
            return ProviderHealth(
                provider="ollama",
                reachable=True,
                chat_model=self.config.chat_model,
                chat_model_present=chat_present,
                embedding_model=self.config.embedding_model,
                embedding_model_present=embedding_present,
                mock=False,
                chat_model_error=(
                    None if chat_present else
                    "Set a chat model in Settings." if not self.config.chat_model else
                    f"Run: ollama pull {self.config.chat_model}"
                ),
                embedding_model_error=(
                    None if embedding_present else
                    "Set an embedding model in Settings." if not self.config.embedding_model else
                    f"Run: ollama pull {self.config.embedding_model}"
                ),
            )
        return ProviderHealth(
            provider="ollama",
            reachable=False,
            chat_model=self.config.chat_model,
            chat_model_present=False,
            embedding_model=self.config.embedding_model,
            embedding_model_present=False,
            mock=False,
            error=message,
            chat_model_error=message or "Could not check chat model.",
            embedding_model_error=message or "Could not check embedding model.",
        )


def _mock_value(schema: dict[str, Any], root: dict[str, Any] | None = None) -> Any:
    root = root or schema
    reference = schema.get("$ref")
    if isinstance(reference, str) and reference.startswith("#/"):
        value: Any = root
        for part in reference[2:].split("/"):
            value = value[part.replace("~1", "/").replace("~0", "~")]
        return _mock_value(value, root)
    if "enum" in schema:
        return schema["enum"][0]
    kind = schema.get("type")
    if kind == "object":
        properties = schema.get("properties", {})
        required = set(schema.get("required", properties))
        return {
            key: _mock_value(value, root)
            for key, value in properties.items()
            if key in required
        }
    if kind == "array":
        return [_mock_value(schema.get("items", {}), root)]
    return {"string": "Mock response", "integer": 0, "number": 0.0, "boolean": False}.get(kind)


class MockProvider:
    """Deterministic provider for tests and explicit Demo Mode only."""

    async def chat(
        self, messages: list[dict[str, str]], json_schema: dict[str, Any] | None = None
    ) -> ChatResult:
        if json_schema:
            value = _mock_value(json_schema)
            properties = json_schema.get("properties", {})
            if {"answer", "claims", "unsupported"}.issubset(properties):
                passages = re.findall(
                    r"\[Retrieved chunk \d+; note_id=(\d+);[^\]]*\]\n"
                    r".*?<NOTE_DATA>\n(.*?)\n</NOTE_DATA>",
                    messages[-1]["content"],
                    flags=re.DOTALL,
                )
                passage = next(
                    (
                        (int(note_id), line.strip())
                        for note_id, content in passages
                        for line in content.splitlines()
                        if line.strip()
                    ),
                    None,
                )
                if passage is None:
                    value = {
                        "answer": "I couldn't find support for this in your notes",
                        "claims": [],
                        "unsupported": [],
                    }
                else:
                    note_id, quote = passage
                    statement = f"Demo Mode retrieved this passage: {quote}"
                    value = {
                        "answer": statement,
                        "claims": [{"text": statement, "quote": quote, "note_id": note_id}],
                        "unsupported": [],
                    }
            elif "claims" in properties:
                wrapped = messages[-1]["content"]
                match = re.search(
                    r"<NOTE_DATA>\n(.*?)\n</NOTE_DATA>",
                    wrapped,
                    flags=re.DOTALL,
                )
                block = match.group(1) if match else ""
                frontmatter = re.match(r"\A---\r?\n.*?\r?\n---(?:\r?\n|\Z)", block, re.DOTALL)
                if frontmatter:
                    block = block[frontmatter.end():]
                quote = next(
                    (
                        line.strip()
                        for line in block.splitlines()
                        if line.strip()
                        and not re.match(r"^\s{0,3}#{1,6}\s", line)
                    ),
                    "",
                )
                value = {
                    "claims": (
                        [{"claim_text": quote[:2000], "quote": quote[:10000], "heading": None}]
                        if quote
                        else []
                    )
                }
            elif {"source_quote", "target_quote"}.issubset(properties):
                note_blocks = re.findall(
                    r"(?:^|\n)<NOTE_DATA>\n(.*?)\n</NOTE_DATA>",
                    messages[-1]["content"],
                    flags=re.DOTALL,
                )

                def excerpt(block: str) -> str:
                    frontmatter = re.match(
                        r"\A---\r?\n.*?\r?\n---(?:\r?\n|\Z)",
                        block,
                        flags=re.DOTALL,
                    )
                    if frontmatter:
                        block = block[frontmatter.end():]
                    for line in block.splitlines():
                        candidate = re.sub(r"^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|>\s*)", "", line).strip()
                        if (
                            candidate
                            and not candidate.startswith("---")
                            and not re.fullmatch(r"#[\w/-]+", candidate)
                        ):
                            return candidate[:500]
                    return ""

                if len(note_blocks) >= 2:
                    value["source_quote"] = excerpt(note_blocks[0])
                    value["target_quote"] = excerpt(note_blocks[1])
                    value["explanation"] = "Deterministic mock proposal for human review."
            content = json.dumps(value)
        else:
            content = "Deterministic demo response."
        return ChatResult(content, "mock", True)

    async def embed(self, texts: list[str]) -> EmbeddingResult:
        vectors = []
        for text in texts:
            raw = hashlib.sha256(text.encode("utf-8")).digest()[:8]
            vector = [byte / 127.5 - 1 for byte in raw]
            vectors.append(vector)
        return EmbeddingResult(vectors, "mock", True)

    async def health(self) -> ProviderHealth:
        return ProviderHealth("mock", True, "mock", True, "mock", True, True)


def create_provider(config: AIConfig) -> Provider:
    if config.demo_mode:
        return MockProvider()
    return OllamaProvider(config)
