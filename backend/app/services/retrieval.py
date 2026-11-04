from dataclasses import dataclass
import hashlib
import json
import re

import numpy as np
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.config import APP_NAME
from app.ai.providers import AIProviderError, Provider
from app.models import ChunkEmbedding, Note, RetrievalChunk, Setting
from app.services.vault import VaultError, get_vault_root, resolve_note_path

MAX_CHUNK_CHARS = 1800
BM25_CANDIDATE_LIMIT = 40
DEFAULT_TOP_K = 8
TOKEN_RE = re.compile(r"[\w-]+", flags=re.UNICODE)
HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$")


@dataclass(frozen=True)
class RetrievalScope:
    kind: str
    note_id: int | None = None
    folder: str | None = None
    tag: str | None = None


@dataclass(frozen=True)
class RetrievalHit:
    chunk_id: int
    note_id: int
    title: str
    path: str
    heading: str
    content: str
    content_hash: str
    chunk_index: int
    quote_start: int
    quote_end: int
    bm25_rank: int
    score: float


def assert_hits_current(session: Session, hits: list[RetrievalHit]) -> None:
    if not hits:
        return
    root = get_vault_root(session)
    if root is None:
        raise VaultError("vault_not_open", "Open a vault before using Ask.", 409)
    checked: set[str] = set()
    for hit in hits:
        if hit.path in checked:
            continue
        checked.add(hit.path)
        path = resolve_note_path(root, hit.path)
        if not path.is_file():
            raise AIProviderError(
                "vault_rescan_required",
                "A retrieved note is missing; rescan the vault before using Ask.",
            )
        try:
            content = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            raise AIProviderError(
                "note_unavailable",
                "A retrieved note could not be read; check the vault file and rescan.",
            ) from error
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        if digest != hit.content_hash:
            raise AIProviderError(
                "vault_rescan_required",
                f"A retrieved note changed outside {APP_NAME}; rescan the vault before using Ask.",
            )


def _frontmatter_offset(content: str) -> int:
    match = re.match(r"\A---\r?\n.*?\r?\n---(?:\r?\n|\Z)", content, re.DOTALL)
    return match.end() if match else 0


def _split_long_block(text_value: str, start: int, heading: str):
    offset = 0
    while offset < len(text_value):
        stop = min(offset + MAX_CHUNK_CHARS, len(text_value))
        if stop < len(text_value):
            boundary = text_value.rfind(" ", offset, stop)
            if boundary > offset + MAX_CHUNK_CHARS // 2:
                stop = boundary
        left, right = offset, stop
        while left < right and text_value[left].isspace():
            left += 1
        while right > left and text_value[right - 1].isspace():
            right -= 1
        if left < right:
            yield {
                "heading": heading,
                "content": text_value[left:right],
                "quote_start": start + left,
                "quote_end": start + right,
            }
        offset = stop


def markdown_chunks(content: str):
    body_offset = _frontmatter_offset(content)
    body = content[body_offset:]
    heading = ""
    buffer: list[str] = []
    block_start = 0
    cursor = body_offset

    def flush():
        nonlocal buffer
        if not buffer:
            return []
        block = "".join(buffer)
        start = block_start
        leading = len(block) - len(block.lstrip())
        trimmed = block.strip()
        buffer = []
        if not trimmed:
            return []
        start += leading
        return list(_split_long_block(trimmed, start, heading))

    result = []
    for line in body.splitlines(keepends=True):
        heading_match = HEADING_RE.match(line.rstrip("\r\n"))
        if heading_match:
            result.extend(flush())
            heading = heading_match.group(1).strip()
            cursor += len(line)
            continue
        if not line.strip():
            result.extend(flush())
            cursor += len(line)
            continue
        if not buffer:
            block_start = cursor
        buffer.append(line)
        cursor += len(line)
    result.extend(flush())
    return result


def refresh_retrieval_chunks(
    session: Session,
    note: Note,
    content: str,
    archived: bool,
) -> None:
    if not archived:
        existing_hash = session.scalar(
            select(RetrievalChunk.content_hash)
            .where(RetrievalChunk.note_id == note.id)
            .limit(1)
        )
        if existing_hash == note.content_hash:
            return
    session.execute(delete(RetrievalChunk).where(RetrievalChunk.note_id == note.id))
    session.execute(delete(ChunkEmbedding).where(ChunkEmbedding.note_id == note.id))
    if archived:
        return
    for index, chunk in enumerate(markdown_chunks(content)):
        session.add(
            RetrievalChunk(
                note_id=note.id,
                content_hash=note.content_hash,
                chunk_index=index,
                **chunk,
            )
        )
    session.flush()


def ensure_retrieval_index(session: Session) -> None:
    setting = session.get(Setting, "retrieval.chunks_version")
    if setting is not None and setting.value == "1":
        return
    root = get_vault_root(session)
    if root is None:
        raise VaultError("vault_not_open", "Open a vault before using Ask.", 409)
    for note in session.scalars(select(Note).order_by(Note.id)).all():
        path = resolve_note_path(root, note.path)
        if not path.is_file():
            raise VaultError(
                "note_file_missing",
                f"Note file '{note.path}' is missing; rescan the vault before using Ask.",
                409,
            )
        content = path.read_text(encoding="utf-8")
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        if digest != note.content_hash:
            raise VaultError(
                "vault_rescan_required",
                f"A note changed outside {APP_NAME}; rescan the vault before using Ask.",
                409,
            )
        refresh_retrieval_chunks(session, note, content, note.archived_at is not None)
    if setting is None:
        session.add(Setting(key="retrieval.chunks_version", value="1"))
    else:
        setting.value = "1"
    session.flush()


def fts_query(question: str) -> str:
    words = TOKEN_RE.findall(question)[:24]
    return " OR ".join(f'"{word.replace(chr(34), chr(34) * 2)}"*' for word in words)


def _scope_sql(scope: RetrievalScope) -> tuple[str, dict[str, object]]:
    if scope.kind == "current_note" and scope.note_id is not None:
        return "AND n.id = :scope_note_id", {"scope_note_id": scope.note_id}
    if scope.kind == "folder" and scope.folder:
        folder = scope.folder.strip("/").replace("\\", "/")
        return (
            "AND substr(n.path, 1, :folder_length) = :folder_prefix",
            {"folder_length": len(folder) + 1, "folder_prefix": f"{folder}/"},
        )
    if scope.kind == "tag" and scope.tag:
        return (
            "AND EXISTS (SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id "
            "WHERE nt.note_id = n.id AND t.name = :scope_tag)",
            {"scope_tag": scope.tag.casefold().lstrip("#")},
        )
    if scope.kind == "vault":
        return "", {}
    raise ValueError("Invalid retrieval scope.")


def retrieve_bm25(
    session: Session,
    question: str,
    scope: RetrievalScope,
    limit: int = BM25_CANDIDATE_LIMIT,
) -> list[RetrievalHit]:
    match = fts_query(question)
    if not match:
        return []
    scope_clause, parameters = _scope_sql(scope)
    rows = session.execute(
        text(
            f"""
            SELECT c.id, c.note_id, n.title, n.path, c.heading, c.content,
                   c.content_hash, c.chunk_index, c.quote_start, c.quote_end,
                   bm25(retrieval_chunks_fts) AS rank
            FROM retrieval_chunks_fts
            JOIN retrieval_chunks c ON c.id = retrieval_chunks_fts.rowid
            JOIN notes n ON n.id = c.note_id
            WHERE retrieval_chunks_fts MATCH :match_query
              AND n.archived_at IS NULL
              {scope_clause}
            ORDER BY bm25(retrieval_chunks_fts)
            LIMIT :limit
            """
        ),
        {"match_query": match, "limit": limit, **parameters},
    ).all()
    return [
        RetrievalHit(
            chunk_id=row.id,
            note_id=row.note_id,
            title=row.title,
            path=row.path,
            heading=row.heading,
            content=row.content,
            content_hash=row.content_hash,
            chunk_index=row.chunk_index,
            quote_start=row.quote_start,
            quote_end=row.quote_end,
            bm25_rank=index,
            score=1 / (index + 1),
        )
        for index, row in enumerate(rows)
    ]


def _cosine(query: list[float], candidates: list[list[float]]) -> list[float]:
    query_vector = np.asarray(query, dtype=np.float64)
    vectors = np.asarray(candidates, dtype=np.float64)
    if query_vector.ndim != 1 or vectors.ndim != 2 or vectors.shape[1] != query_vector.shape[0]:
        raise AIProviderError("invalid_embedding", "The embedding provider returned incompatible vectors.")
    query_norm = np.linalg.norm(query_vector)
    norms = np.linalg.norm(vectors, axis=1)
    if query_norm == 0 or np.any(norms == 0):
        raise AIProviderError("invalid_embedding", "The embedding provider returned an empty vector.")
    return (vectors @ query_vector / (norms * query_norm)).tolist()


async def hybrid_rerank(
    session: Session,
    provider: Provider,
    model: str,
    question: str,
    candidates: list[RetrievalHit],
    top_k: int = DEFAULT_TOP_K,
) -> tuple[list[RetrievalHit], bool]:
    if not candidates:
        return [], False
    cached: dict[tuple[int, str, int], list[float]] = {}
    missing: list[RetrievalHit] = []
    for hit in candidates:
        vector_json = session.scalar(
            select(ChunkEmbedding.vector_json).where(
                ChunkEmbedding.note_id == hit.note_id,
                ChunkEmbedding.content_hash == hit.content_hash,
                ChunkEmbedding.model == model,
                ChunkEmbedding.chunk_index == hit.chunk_index,
            )
        )
        key = (hit.note_id, hit.content_hash, hit.chunk_index)
        if vector_json is None:
            missing.append(hit)
        else:
            cached[key] = json.loads(vector_json)
    texts = [question, *(hit.content for hit in missing)]
    if missing:
        embedded = await provider.embed(texts)
        if len(embedded.embeddings) != len(texts):
            raise AIProviderError("invalid_embedding", "The embedding provider returned an unexpected vector count.")
        query_vector, *new_vectors = embedded.embeddings
        for hit, vector in zip(missing, new_vectors, strict=True):
            cached[(hit.note_id, hit.content_hash, hit.chunk_index)] = vector
            session.add(
                ChunkEmbedding(
                    note_id=hit.note_id,
                    content_hash=hit.content_hash,
                    model=model,
                    chunk_index=hit.chunk_index,
                    vector_json=json.dumps(vector),
                )
            )
        session.flush()
    else:
        embedded_query = await provider.embed([question])
        if len(embedded_query.embeddings) != 1:
            raise AIProviderError("invalid_embedding", "The embedding provider returned an unexpected vector count.")
        query_vector = embedded_query.embeddings[0]
    similarities = _cosine(
        query_vector,
        [cached[(hit.note_id, hit.content_hash, hit.chunk_index)] for hit in candidates],
    )
    reranked = [
        RetrievalHit(**{
            **hit.__dict__,
            "score": 0.6 * hit.score + 0.4 * max(0.0, similarities[index]),
        })
        for index, hit in enumerate(candidates)
    ]
    return sorted(reranked, key=lambda hit: hit.score, reverse=True)[:top_k], True
