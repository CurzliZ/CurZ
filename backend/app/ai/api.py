import asyncio

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.ai.providers import AIConfig, ProviderHealth, create_provider, normalize_ollama_url
from app.ai.schemas import (
    AIHealthResponse,
    AISettingsResponse,
    AISettingsUpdate,
    AITaskRequest,
    AITaskResponse,
    NoteClaimsResponse,
)
from app.ai.claims import claims_response, reverify_note_evidence, read_note_content
from app.ai.settings import get_ai_config, save_ai_config
from app.ai.tasks import create_task, execute_task, task_response
from app.api_common import get_db_session, get_note, require_vault
from app.models import AITask, Claim
from app.models import utc_now
from app.services.vault import VaultError, get_vault_root

router = APIRouter(prefix="/api/ai", tags=["ai"])
claims_router = APIRouter(prefix="/api/notes", tags=["claims"])


def _settings_response(config: AIConfig) -> AISettingsResponse:
    return AISettingsResponse(
        provider="mock" if config.demo_mode else "ollama",
        ollama_url=config.ollama_url,
        chat_model=config.chat_model,
        embedding_model=config.embedding_model,
        timeout_seconds=config.timeout_seconds,
        demo_mode=config.demo_mode,
    )


def _health_response(result: ProviderHealth) -> AIHealthResponse:
    return AIHealthResponse(**result.__dict__)


@router.get("/settings", response_model=AISettingsResponse)
def read_ai_settings(session: Session = Depends(get_db_session)) -> AISettingsResponse:
    return _settings_response(get_ai_config(session))


@router.put("/settings", response_model=AISettingsResponse)
def update_ai_settings(
    payload: AISettingsUpdate,
    session: Session = Depends(get_db_session),
) -> AISettingsResponse:
    config = AIConfig(
        ollama_url=normalize_ollama_url(str(payload.ollama_url)),
        chat_model=payload.chat_model.strip(),
        embedding_model=payload.embedding_model.strip(),
        timeout_seconds=payload.timeout_seconds,
        demo_mode=payload.demo_mode,
    )
    saved = save_ai_config(session, config)
    return _settings_response(saved)


@router.get("/health", response_model=AIHealthResponse)
async def ai_health(session: Session = Depends(get_db_session)) -> AIHealthResponse:
    config = get_ai_config(session)
    return _health_response(await create_provider(config).health())


@router.post("/test-connection", response_model=AIHealthResponse)
async def test_ai_connection(session: Session = Depends(get_db_session)) -> AIHealthResponse:
    config = get_ai_config(session)
    return _health_response(await create_provider(config).health())


@claims_router.get("/{note_id}/claims", response_model=NoteClaimsResponse)
def read_note_claims(
    note_id: int,
    session: Session = Depends(get_db_session),
) -> NoteClaimsResponse:
    root = require_vault(session)
    note = get_note(session, note_id)
    content = read_note_content(root, note)
    reverify_note_evidence(session, note, content)
    session.commit()
    return claims_response(session, note_id)


@claims_router.post(
    "/{note_id}/claims/extract",
    response_model=AITaskResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def extract_note_claims(
    note_id: int,
    request: Request,
    session: Session = Depends(get_db_session),
) -> AITaskResponse:
    root = require_vault(session)
    note = get_note(session, note_id)
    read_note_content(root, note)
    config = get_ai_config(session)
    task = create_task(session, config, "extract_claims")
    jobs: dict[str, asyncio.Task[None]] = request.app.state.ai_jobs
    job = asyncio.create_task(
        execute_task(
            task.id,
            request.app.state.session_factory,
            config,
            "extract_claims",
            {"note_id": note_id},
        ),
        name=f"ai-task-{task.id}",
    )
    jobs[task.id] = job
    job.add_done_callback(lambda _job, task_id=task.id: jobs.pop(task_id, None))
    return AITaskResponse(**task_response(task))


@claims_router.delete("/{note_id}/claims/{claim_id}")
def remove_note_claim(
    note_id: int,
    claim_id: int,
    session: Session = Depends(get_db_session),
) -> dict[str, bool]:
    require_vault(session)
    claim = session.get(Claim, claim_id)
    if claim is None or claim.note_id != note_id:
        raise VaultError("claim_not_found", "Claim was not found for this note.", 404)
    session.delete(claim)
    session.commit()
    return {"deleted": True}


@router.post("/tasks", response_model=AITaskResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_ai_task(
    payload: AITaskRequest,
    request: Request,
    session: Session = Depends(get_db_session),
) -> AITaskResponse:
    config = get_ai_config(session)
    task = create_task(session, config, payload.type)
    jobs: dict[str, asyncio.Task[None]] = request.app.state.ai_jobs
    job = asyncio.create_task(
        execute_task(
            task.id,
            request.app.state.session_factory,
            config,
            payload.type,
            payload.model_dump(exclude={"type"}),
        ),
        name=f"ai-task-{task.id}",
    )
    jobs[task.id] = job
    job.add_done_callback(lambda _job, task_id=task.id: jobs.pop(task_id, None))
    return AITaskResponse(**task_response(task))


@router.get("/tasks/{task_id}", response_model=AITaskResponse)
def read_ai_task(task_id: str, session: Session = Depends(get_db_session)) -> AITaskResponse:
    task = session.get(AITask, task_id)
    if task is None:
        raise VaultError("ai_task_not_found", "AI task was not found.", 404)
    return AITaskResponse(**task_response(task))


@router.post("/tasks/{task_id}/cancel", response_model=AITaskResponse)
def cancel_ai_task(
    task_id: str,
    request: Request,
    session: Session = Depends(get_db_session),
) -> AITaskResponse:
    task = session.get(AITask, task_id)
    if task is None:
        raise VaultError("ai_task_not_found", "AI task was not found.", 404)
    if task.status in {"pending", "running"}:
        task.status = "cancelled"
        task.completed_at = utc_now()
        session.commit()
        job = request.app.state.ai_jobs.get(task_id)
        if job is not None:
            job.cancel()
    return AITaskResponse(**task_response(task))
