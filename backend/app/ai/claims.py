from pathlib import Path
import hashlib

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.ai.schemas import ClaimResponse, EvidenceResponse, ExtractionStatsResponse, NoteClaimsResponse
from app.ai.verifier import verify_quote
from app.models import Claim, Evidence, ExtractionStat, Note
from app.services.vault import VaultError, resolve_note_path


def claims_response(session: Session, note_id: int) -> NoteClaimsResponse:
    claims = session.scalars(
        select(Claim)
        .options(selectinload(Claim.evidence))
        .where(
            Claim.note_id == note_id,
            Claim.state.not_in(("removed", "superseded")),
        )
        .order_by(Claim.id)
    ).all()
    stats = session.scalar(
        select(ExtractionStat)
        .where(ExtractionStat.note_id == note_id)
        .order_by(ExtractionStat.created_at.desc())
        .limit(1)
    )
    return NoteClaimsResponse(
        note_id=note_id,
        claims=[
            ClaimResponse(
                id=claim.id,
                text=claim.text,
                state=claim.state,
                interpretation=claim.state == "interpretation",
                mock=claim.is_mock,
                evidence=[
                    EvidenceResponse(
                        id=item.id,
                        heading=item.heading,
                        quote=item.quote,
                        quote_start=item.quote_start,
                        quote_end=item.quote_end,
                        source_hash=item.source_hash,
                        status=item.status,
                    )
                    for item in claim.evidence
                ],
            )
            for claim in claims
        ],
        stats=(
            ExtractionStatsResponse(
                raw_quotes=stats.raw_quotes,
                verified_quotes=stats.verified_quotes,
            )
            if stats
            else None
        ),
    )


def reverify_note_evidence(session: Session, note: Note, content: str) -> None:
    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
    evidence_items = session.scalars(
        select(Evidence).where(Evidence.note_id == note.id)
    ).all()
    for evidence in evidence_items:
        span = verify_quote(content, evidence.quote)
        if span is None:
            evidence.status = "stale"
        else:
            evidence.status = "verified"
            evidence.source_hash = digest
            evidence.quote_start = span.start
            evidence.quote_end = span.end


def persist_verified_claims(
    session: Session,
    note: Note,
    task_id: str,
    content: str,
    generated: list[dict[str, str | None]],
    mock: bool,
) -> tuple[int, int]:
    for old_claim in session.scalars(
        select(Claim).where(
            Claim.note_id == note.id,
            Claim.state.not_in(("removed", "superseded")),
        )
    ).all():
        old_claim.state = "superseded"
    session.flush()

    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
    raw_quotes = len(generated)
    verified_quotes = 0
    for item in generated:
        quote = item["quote"] or ""
        span = verify_quote(content, quote)
        claim = Claim(
            note_id=note.id,
            text=item["claim_text"] or "",
            state="verified" if span else "interpretation",
            is_mock=mock,
        )
        session.add(claim)
        session.flush()
        if span:
            session.add(
                Evidence(
                    claim_id=claim.id,
                    note_id=note.id,
                    heading=item.get("heading"),
                    quote=quote,
                    quote_start=span.start,
                    quote_end=span.end,
                    source_hash=digest,
                    status="verified",
                )
            )
            verified_quotes += 1
    session.add(
        ExtractionStat(
            note_id=note.id,
            task_id=task_id,
            raw_quotes=raw_quotes,
            verified_quotes=verified_quotes,
        )
    )
    return raw_quotes, verified_quotes


def read_note_content(root: Path, note: Note) -> str:
    path = resolve_note_path(root, note.path)
    if not path.is_file():
        raise VaultError("note_file_missing", "The note file is missing; rescan the vault.", 409)
    return path.read_text(encoding="utf-8")
