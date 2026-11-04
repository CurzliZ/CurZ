from collections import Counter
from hashlib import sha256
import math
import re

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.models import Note, SemanticNeighbor, Setting

SEMANTIC_INDEX_KEY = "semantic_index_fingerprint"
DEFAULT_NEIGHBORS_PER_NOTE = 10
TOKEN_PATTERN = re.compile(r"[^\W_]{2,}", flags=re.UNICODE)


def _fingerprint(notes: list[Note]) -> str:
    corpus = "\n".join(f"{note.id}:{note.content_hash}" for note in notes)
    return sha256(corpus.encode("utf-8")).hexdigest()


def _document_terms(title: str, body: str) -> Counter[str]:
    return Counter(TOKEN_PATTERN.findall(f"{title}\n{body}".casefold()))


def ensure_semantic_index(
    session: Session,
    top_k: int = DEFAULT_NEIGHBORS_PER_NOTE,
) -> bool:
    notes = session.scalars(
        select(Note)
        .where(Note.archived_at.is_(None))
        .order_by(Note.id)
    ).all()
    fingerprint = _fingerprint(notes)
    saved = session.get(Setting, SEMANTIC_INDEX_KEY)
    if saved is not None and saved.value == fingerprint:
        return False

    documents = session.execute(
        text(
            """
            SELECT CAST(notes_fts.note_id AS INTEGER), notes_fts.title, notes_fts.body
            FROM notes_fts
            JOIN notes ON CAST(notes_fts.note_id AS INTEGER) = notes.id
            WHERE notes.archived_at IS NULL
            ORDER BY notes.id
            """
        )
    ).all()
    note_hashes = {note.id: note.content_hash for note in notes}
    term_counts = {
        note_id: _document_terms(title or "", body or "")
        for note_id, title, body in documents
        if note_id in note_hashes
    }
    frequencies: Counter[str] = Counter()
    for counts in term_counts.values():
        frequencies.update(counts.keys())
    document_count = len(term_counts)
    vectors: dict[int, dict[str, float]] = {}
    norms: dict[int, float] = {}
    for note_id, counts in term_counts.items():
        vector = {
            term: frequency * (math.log((document_count + 1) / (frequencies[term] + 1)) + 1)
            for term, frequency in counts.items()
        }
        vectors[note_id] = vector
        norms[note_id] = math.sqrt(sum(weight * weight for weight in vector.values()))

    top: dict[int, list[tuple[float, int]]] = {note_id: [] for note_id in term_counts}
    note_ids = list(term_counts)
    for index, source_id in enumerate(note_ids):
        source_vector = vectors[source_id]
        for target_id in note_ids[index + 1 :]:
            target_vector = vectors[target_id]
            common = source_vector.keys() & target_vector.keys()
            if not common:
                continue
            denominator = norms[source_id] * norms[target_id]
            if not denominator:
                continue
            score = sum(source_vector[term] * target_vector[term] for term in common) / denominator
            top[source_id].append((score, target_id))
            top[target_id].append((score, source_id))

    session.execute(delete(SemanticNeighbor))
    for source_id, neighbors in top.items():
        neighbors.sort(key=lambda item: (-item[0], item[1]))
        session.add_all(
            SemanticNeighbor(
                source_id=source_id,
                target_id=target_id,
                source_content_hash=note_hashes[source_id],
                target_content_hash=note_hashes[target_id],
                score=score,
            )
            for score, target_id in neighbors[:top_k]
        )
    if saved is None:
        saved = Setting(key=SEMANTIC_INDEX_KEY, value=fingerprint)
        session.add(saved)
    else:
        saved.value = fingerprint
    session.flush()
    return True


def semantic_edges(
    session: Session,
    ids: list[int],
    threshold: float,
) -> list[tuple[int, int, float]]:
    if not ids:
        return []
    notes = {
        note.id: note.content_hash
        for note in session.scalars(select(Note).where(Note.id.in_(ids))).all()
    }
    rows = session.scalars(
        select(SemanticNeighbor)
        .where(
            SemanticNeighbor.source_id.in_(ids),
            SemanticNeighbor.target_id.in_(ids),
            SemanticNeighbor.score >= threshold,
        )
        .order_by(SemanticNeighbor.score.desc(), SemanticNeighbor.source_id, SemanticNeighbor.target_id)
    ).all()
    edges: dict[tuple[int, int], float] = {}
    for row in rows:
        if (
            notes.get(row.source_id) != row.source_content_hash
            or notes.get(row.target_id) != row.target_content_hash
        ):
            continue
        pair = (min(row.source_id, row.target_id), max(row.source_id, row.target_id))
        edges[pair] = max(edges.get(pair, 0.0), row.score)
    return [(source, target, score) for (source, target), score in edges.items()]
