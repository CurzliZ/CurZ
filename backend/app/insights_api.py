from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api_common import get_db_session, get_note, require_vault
from app.phase12_schemas import (
    GapsResponse,
    RevisitPreferenceResponse,
    RevisitPreferenceUpdate,
    RevisitResponse,
)
from app.services.insights import collect_gaps
from app.services.revisit import get_revisit, set_revisit_preference

router = APIRouter(prefix="/api", tags=["insights"])


@router.get("/insights/gaps", response_model=GapsResponse)
def list_gaps(session: Session = Depends(get_db_session)) -> GapsResponse:
    require_vault(session)
    return collect_gaps(session)


@router.get("/revisit", response_model=RevisitResponse)
def list_revisit(
    current_note_id: int | None = None,
    session: Session = Depends(get_db_session),
) -> RevisitResponse:
    require_vault(session)
    return get_revisit(session, current_note_id)


@router.put(
    "/revisit/{note_id}",
    response_model=RevisitPreferenceResponse,
)
def update_revisit_preference(
    note_id: int,
    payload: RevisitPreferenceUpdate,
    session: Session = Depends(get_db_session),
) -> RevisitPreferenceResponse:
    require_vault(session)
    note = get_note(session, note_id)
    return set_revisit_preference(session, note.id, payload.state)
