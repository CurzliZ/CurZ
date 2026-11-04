from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Claim,
    Evidence,
    Link,
    Note,
    Relationship,
    RevisitPreference,
    SemanticNeighbor,
    utc_now,
)
from app.phase12_schemas import RevisitItem, RevisitPreferenceResponse, RevisitResponse

REASON_PRIORITY = {
    "saved_for_later": -1,
    "related_to_current": 0,
    "unresolved_review": 1,
    "linked_to_recent": 2,
    "new_connection": 3,
    "valuable_untouched": 4,
}


def _insert_reason(
    reasons: dict[int, tuple[str, str]], note_id: int, code: str, message: str
) -> None:
    current = reasons.get(note_id)
    if current is None or REASON_PRIORITY[code] < REASON_PRIORITY[current[0]]:
        reasons[note_id] = (code, message)


def get_revisit(session: Session, current_note_id: int | None) -> RevisitResponse:
    now = utc_now()
    notes = session.scalars(
        select(Note).where(Note.archived_at.is_(None)).order_by(Note.updated_at.desc())
    ).all()
    by_id = {note.id: note for note in notes}
    if not notes:
        return RevisitResponse(items=[])
    recent_ids = {note.id for note in notes[:5]}
    reasons: dict[int, tuple[str, str]] = {}
    links = session.execute(
        select(Link.source_id, Link.target_id)
        .join(Note, Note.id == Link.source_id)
        .where(
            Note.archived_at.is_(None),
            Link.target_id.is_not(None),
            Link.target_id.in_(by_id),
        )
    ).all()
    adjacency: dict[int, set[int]] = {}
    explicit_pairs = set()
    for source, target in links:
        adjacency.setdefault(source, set()).add(target)
        adjacency.setdefault(target, set()).add(source)
        explicit_pairs.add((min(source, target), max(source, target)))
    if current_note_id in by_id:
        for related_id in adjacency.get(current_note_id, set()):
            _insert_reason(
                reasons,
                related_id,
                "related_to_current",
                f"Linked to the currently selected note, {by_id[current_note_id].title}.",
            )
    for recent_id in recent_ids:
        for linked_id in adjacency.get(recent_id, set()):
            if linked_id != recent_id and linked_id not in recent_ids:
                _insert_reason(
                    reasons,
                    linked_id,
                    "linked_to_recent",
                    f"Linked to recently edited note, {by_id[recent_id].title}.",
                )

    pending = session.execute(
        select(Relationship.source_note_id, Relationship.target_note_id)
        .where(Relationship.state.in_(("pending", "outdated")))
    ).all()
    for source, target in pending:
        for note_id in (source, target):
            if note_id in by_id:
                _insert_reason(
                    reasons,
                    note_id,
                    "unresolved_review",
                    "Has a relationship waiting for your review.",
                )

    semantic = session.execute(
        select(
            SemanticNeighbor.source_id,
            SemanticNeighbor.target_id,
            SemanticNeighbor.source_content_hash,
            SemanticNeighbor.target_content_hash,
        )
    ).all()
    for source, target, source_hash, target_hash in semantic:
        if source not in by_id or target not in by_id:
            continue
        if (
            by_id[source].content_hash != source_hash
            or by_id[target].content_hash != target_hash
            or (min(source, target), max(source, target)) in explicit_pairs
        ):
            continue
        _insert_reason(
            reasons,
            source,
            "new_connection",
            f"Has a topic similarity with {by_id[target].title} but no explicit link.",
        )

    degrees: dict[int, int] = {}
    for source, target in links:
        degrees[source] = degrees.get(source, 0) + 1
        degrees[target] = degrees.get(target, 0) + 1
    valued = set(
        session.scalars(
            select(Claim.note_id)
            .join(Evidence, Evidence.claim_id == Claim.id)
            .where(
                Claim.state.not_in(("removed", "superseded")),
                Evidence.status == "verified",
            )
            .distinct()
        ).all()
    )
    untouched_before = now - timedelta(days=14)
    for note in notes:
        if (
            note.updated_at < untouched_before
            and (degrees.get(note.id, 0) >= 2 or note.id in valued)
        ):
            value_reason = (
                "Contains a verified claim"
                if note.id in valued
                else f"Connects to {degrees[note.id]} notes"
            )
            _insert_reason(
                reasons,
                note.id,
                "valuable_untouched",
                f"{value_reason}; it has not been revisited recently.",
            )

    preferences = {
        row.note_id: row.state
        for row in session.scalars(
            select(RevisitPreference).where(RevisitPreference.note_id.in_(by_id))
        ).all()
    }
    for note_id, state in preferences.items():
        if state == "saved" and note_id in by_id and note_id not in reasons:
            reasons[note_id] = (
                "saved_for_later",
                "Saved for later; ready when you want to return.",
            )
    candidates = []
    for note_id, (code, reason) in reasons.items():
        state = preferences.get(note_id)
        if state == "dismissed":
            continue
        note = by_id[note_id]
        candidates.append(
            RevisitItem(
                note_id=note_id,
                title=note.title,
                path=note.path,
                reason=reason,
                reason_code=code,
                state="saved" if state == "saved" else None,
            )
        )
    candidates.sort(
        key=lambda item: (
            item.state != "saved",
            REASON_PRIORITY[item.reason_code],
            -by_id[item.note_id].updated_at.timestamp(),
        )
    )
    return RevisitResponse(items=candidates[:12])


def set_revisit_preference(
    session: Session, note_id: int, state: str
) -> RevisitPreferenceResponse:
    now = utc_now()
    preference = session.get(RevisitPreference, note_id)
    if preference is None:
        preference = RevisitPreference(note_id=note_id, state=state, updated_at=now)
        session.add(preference)
    else:
        preference.state = state
        preference.updated_at = now
    session.commit()
    return RevisitPreferenceResponse(
        note_id=note_id,
        state=state,
        updated_at=preference.updated_at,
    )
