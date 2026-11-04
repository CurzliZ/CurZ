from datetime import timedelta

import asyncio
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.ai.settings import get_ai_config
from app.ai.tasks import create_task, task_response
from app.api_common import get_db_session, get_note, require_vault
from app.models import (
    AITask,
    Note,
    Relationship,
    RelationshipEvidence,
    ReviewDecision,
    utc_now,
)
from app.schemas import (
    RelationshipCreate,
    RelationshipDecision,
    RelationshipEvidenceOut,
    RelationshipList,
    RelationshipOut,
)
from app.services.index import content_hash
from app.services.relationships import _read_note
from app.services.vault import VaultError, get_vault_root

router = APIRouter(prefix="/api/relationships", tags=["relationships"])
TYPES = {
    "supports", "contradicts", "extends", "example_of", "depends_on",
    "applies_to", "inspired_by", "tension",
}


def _serialize(session: Session, item: Relationship) -> RelationshipOut:
    source = session.get(Note, item.source_note_id)
    target = session.get(Note, item.target_note_id)
    titles = {
        note.id: note.title
        for note in session.scalars(
            select(Note).where(
                Note.id.in_([evidence.note_id for evidence in item.evidence])
            )
        ).all()
    }
    return RelationshipOut(
        id=item.id,
        source_note_id=item.source_note_id,
        source_title=source.title if source else "Missing note",
        target_note_id=item.target_note_id,
        target_title=target.title if target else "Missing note",
        relationship_type=item.relationship_type,
        explanation=item.explanation,
        confidence=item.confidence,
        origin=item.origin,
        state=item.state,
        created_at=item.created_at,
        evidence=[
            RelationshipEvidenceOut(
                note_id=evidence.note_id,
                note_title=titles.get(evidence.note_id, "Missing note"),
                quote=evidence.quote,
                quote_start=evidence.quote_start,
                quote_end=evidence.quote_end,
                status=evidence.status,
            )
            for evidence in item.evidence
        ],
    )


@router.post("/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_relationships(
    request: Request,
    session: Session = Depends(get_db_session),
) -> dict[str, object]:
    require_vault(session)
    config = get_ai_config(session)
    task = create_task(session, config, "generate_relationships")
    jobs: dict[str, asyncio.Task[None]] = request.app.state.ai_jobs
    from app.ai.tasks import execute_task

    job = asyncio.create_task(
        execute_task(
            task.id,
            request.app.state.session_factory,
            config,
            "generate_relationships",
            {},
        ),
        name=f"ai-task-{task.id}",
    )
    jobs[task.id] = job
    job.add_done_callback(lambda _job, task_id=task.id: jobs.pop(task_id, None))
    return task_response(task)


@router.get("/review", response_model=RelationshipList)
def review_relationships(
    view: str = Query(default="relations", pattern="^(relations|tensions|stale)$"),
    session: Session = Depends(get_db_session),
) -> RelationshipList:
    require_vault(session)
    now = utc_now()
    query = (
        select(Relationship)
        .options(selectinload(Relationship.evidence))
        .order_by(Relationship.created_at.desc(), Relationship.id.desc())
    )
    if view == "stale":
        query = query.where(Relationship.state == "outdated")
    else:
        query = query.where(
            Relationship.state == "pending",
            or_(
                Relationship.deferred_at.is_(None),
                Relationship.deferred_at <= now - timedelta(days=1),
            ),
        )
        if view == "tensions":
            query = query.where(Relationship.relationship_type == "tension")
        else:
            query = query.where(Relationship.relationship_type != "tension")
    items = session.scalars(query.limit(200)).all()
    return RelationshipList(items=[_serialize(session, item) for item in items])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=RelationshipOut)
def create_manual_relationship(
    payload: RelationshipCreate,
    session: Session = Depends(get_db_session),
) -> RelationshipOut:
    root = require_vault(session)
    if payload.source_note_id == payload.target_note_id:
        raise VaultError("invalid_relationship", "A note cannot have a relationship to itself.", 422)
    source = get_note(session, payload.source_note_id)
    target = get_note(session, payload.target_note_id)
    source_content = _read_note(root, source)
    target_content = _read_note(root, target)
    from app.ai.verifier import verify_quote

    source_span = verify_quote(source_content, payload.source_quote)
    target_span = verify_quote(target_content, payload.target_quote)
    if source_span is None or target_span is None:
        raise VaultError(
            "unverified_relationship_evidence",
            "Each quote must appear in its corresponding note.",
            422,
        )
    relation = Relationship(
        source_note_id=source.id,
        target_note_id=target.id,
        relationship_type=payload.relationship_type,
        explanation=payload.explanation,
        confidence=1.0,
        origin="manual",
        state="accepted",
        source_hash=content_hash(source_content),
        target_hash=content_hash(target_content),
    )
    session.add(relation)
    session.flush()
    for note, content, quote, span in (
        (source, source_content, payload.source_quote, source_span),
        (target, target_content, payload.target_quote, target_span),
    ):
        session.add(
            RelationshipEvidence(
                relationship_id=relation.id,
                note_id=note.id,
                quote=quote,
                quote_start=span.start,
                quote_end=span.end,
                source_hash=content_hash(content),
                status="verified",
            )
        )
    session.add(
        ReviewDecision(
            relationship_id=relation.id,
            action="accepted",
            relationship_type=relation.relationship_type,
            explanation=relation.explanation,
        )
    )
    session.commit()
    session.refresh(relation)
    return _serialize(session, relation)


@router.post("/{relationship_id}/decision", response_model=RelationshipOut)
def decide_relationship(
    relationship_id: int,
    payload: RelationshipDecision,
    session: Session = Depends(get_db_session),
) -> RelationshipOut:
    require_vault(session)
    item = session.scalar(
        select(Relationship)
        .options(selectinload(Relationship.evidence))
        .where(Relationship.id == relationship_id)
    )
    if item is None:
        raise VaultError("relationship_not_found", "Relationship proposal was not found.", 404)
    if item.state not in ("pending", "outdated"):
        raise VaultError("relationship_already_reviewed", "This proposal has already been reviewed.", 409)
    action_map = {
        "accept": ("accepted", "accepted"),
        "edit": ("accepted", "edited"),
        "dismiss": ("rejected", "rejected"),
        "defer": ("pending", "deferred"),
    }
    state, decision = action_map[payload.action]
    if payload.action == "edit":
        if (
            payload.relationship_type not in TYPES
            or payload.explanation is None
            or payload.source_quote is None
            or payload.target_quote is None
        ):
            raise VaultError(
                "edit_fields_required",
                "Editing requires a type, explanation, and a verified quote from each note.",
                422,
            )
        root = require_vault(session)
        source = get_note(session, item.source_note_id)
        target = get_note(session, item.target_note_id)
        source_content = _read_note(root, source)
        target_content = _read_note(root, target)
        from app.ai.verifier import verify_quote

        source_span = verify_quote(source_content, payload.source_quote)
        target_span = verify_quote(target_content, payload.target_quote)
        if source_span is None or target_span is None:
            raise VaultError(
                "unverified_relationship_evidence",
                "Each replacement quote must appear in its corresponding note.",
                422,
            )
        item.relationship_type = payload.relationship_type
        item.explanation = payload.explanation
        item.source_hash = content_hash(source_content)
        item.target_hash = content_hash(target_content)
        for note, content, quote, span in (
            (source, source_content, payload.source_quote, source_span),
            (target, target_content, payload.target_quote, target_span),
        ):
            evidence = next(
                (proof for proof in item.evidence if proof.note_id == note.id),
                None,
            )
            if evidence is None:
                evidence = RelationshipEvidence(
                    relationship_id=item.id,
                    note_id=note.id,
                    quote=quote,
                    quote_start=span.start,
                    quote_end=span.end,
                    source_hash=content_hash(content),
                    status="verified",
                )
                session.add(evidence)
                item.evidence.append(evidence)
            else:
                evidence.quote = quote
                evidence.quote_start = span.start
                evidence.quote_end = span.end
                evidence.source_hash = content_hash(content)
                evidence.status = "verified"
    if payload.action in ("accept", "edit"):
        evidence_notes = {evidence.note_id for evidence in item.evidence if evidence.status == "verified"}
        if evidence_notes != {item.source_note_id, item.target_note_id}:
            raise VaultError(
                "relationship_evidence_stale",
                "Refresh the evidence before accepting this relationship.",
                409,
            )
    item.state = state
    item.deferred_at = utc_now() if payload.action == "defer" else None
    item.updated_at = utc_now()
    session.add(
        ReviewDecision(
            relationship_id=item.id,
            action=decision,
            relationship_type=item.relationship_type if payload.action == "edit" else None,
            explanation=item.explanation if payload.action == "edit" else None,
        )
    )
    session.commit()
    return _serialize(session, item)
