import asyncio

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.ai.settings import get_ai_config
from app.ai.schemas import AITaskResponse
from app.ai.tasks import create_task, execute_task, task_response
from app.api_common import get_db_session, get_note, require_vault
from app.models import Note
from app.schemas import AskRequest, AskScopesResponse
from app.services.ask import available_scopes
from app.services.retrieval import ensure_retrieval_index
from app.services.vault import VaultError

router = APIRouter(prefix="/api/ask", tags=["ask"])


@router.get("/scopes", response_model=AskScopesResponse)
def list_ask_scopes(
    session: Session = Depends(get_db_session),
) -> AskScopesResponse:
    require_vault(session)
    return AskScopesResponse(**available_scopes(session))


@router.post("", response_model=AITaskResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_ask(
    payload: AskRequest,
    request: Request,
    session: Session = Depends(get_db_session),
) -> AITaskResponse:
    require_vault(session)
    ensure_retrieval_index(session)
    if payload.scope.kind == "current_note":
        note = get_note(session, payload.scope.note_id)
        if note.archived_at is not None:
            raise VaultError("note_archived", "Archived notes are not available for Ask.", 409)
    session.commit()
    config = get_ai_config(session)
    task = create_task(session, config, "ask")
    jobs: dict[str, asyncio.Task[None]] = request.app.state.ai_jobs
    job = asyncio.create_task(
        execute_task(
            task.id,
            request.app.state.session_factory,
            config,
            "ask",
            payload.model_dump(),
        ),
        name=f"ai-task-{task.id}",
    )
    jobs[task.id] = job
    job.add_done_callback(lambda _job, task_id=task.id: jobs.pop(task_id, None))
    return AITaskResponse(**task_response(task))
