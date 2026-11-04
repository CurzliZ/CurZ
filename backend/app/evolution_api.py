import asyncio

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.ai.settings import get_ai_config
from app.ai.tasks import create_task, execute_task, task_response
from app.api_common import get_db_session, require_vault
from app.phase12_schemas import (
    EvolutionScope,
    EvolutionSummaryInput,
    EvolutionTimeline,
)
from app.services.evolution import build_timeline, timeline_task_payload
from app.services.vault import VaultError

router = APIRouter(prefix="/api/evolution", tags=["evolution"])


def _scope(note_id: int | None, tag: str | None) -> EvolutionScope:
    if (note_id is None) == (tag is None):
        raise VaultError("invalid_scope", "Provide exactly one note_id or tag.", 400)
    return EvolutionScope(note_id=note_id, tag=tag)


@router.get("", response_model=EvolutionTimeline)
def evolution_timeline(
    note_id: int | None = None,
    tag: str | None = None,
    session: Session = Depends(get_db_session),
) -> EvolutionTimeline:
    require_vault(session)
    return build_timeline(session, _scope(note_id, tag))


@router.post(
    "/summarize",
    status_code=status.HTTP_202_ACCEPTED,
)
async def summarize_evolution(
    payload: EvolutionSummaryInput,
    request: Request,
    session: Session = Depends(get_db_session),
) -> dict:
    require_vault(session)
    timeline = build_timeline(session, _scope(payload.note_id, payload.tag))
    config = get_ai_config(session)
    task = create_task(session, config, "summarize_evolution")
    jobs: dict[str, asyncio.Task[None]] = request.app.state.ai_jobs
    job = asyncio.create_task(
        execute_task(
            task.id,
            request.app.state.session_factory,
            config,
            "summarize_evolution",
            timeline_task_payload(timeline),
        ),
        name=f"ai-task-{task.id}",
    )
    jobs[task.id] = job
    job.add_done_callback(lambda _job, task_id=task.id: jobs.pop(task_id, None))
    return task_response(task)
