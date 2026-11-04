from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.ai.providers import AIProviderError, ChatResult, Provider

T = TypeVar("T", bound=BaseModel)


async def request_structured(
    provider: Provider, messages: list[dict[str, str]], response_model: type[T]
) -> tuple[T, bool]:
    schema = response_model.model_json_schema()
    original = list(messages)
    for attempt in range(2):
        try:
            result: ChatResult = await provider.chat(original, json_schema=schema)
            parsed = response_model.model_validate_json(result.content)
            return parsed, result.mock
        except ValidationError:
            if attempt == 0:
                original = [
                    *messages,
                    {"role": "assistant", "content": result.content},
                    {"role": "user", "content": "Repair the previous response to match the required JSON schema exactly. Return JSON only."},
                ]
    raise AIProviderError(
        "invalid_json",
        "The model did not return valid structured data after one repair attempt.",
    )
