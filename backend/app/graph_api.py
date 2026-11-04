from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api_common import get_db_session, require_vault
from app.models import Note
from app.schemas import (
    GraphLayoutResult,
    GraphLayoutResetResult,
    GraphLayoutSave,
    GraphNeighborhood,
    GraphOverview,
)
from app.services.graph import get_neighborhood, get_overview
from app.services.graph_layout import clear_layout, save_layout
from app.services.vault import VaultError

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get("/neighborhood/{center_id}", response_model=GraphNeighborhood)
def graph_neighborhood(
    center_id: int,
    depth: int = Query(default=1, ge=1, le=3),
    limit: int = Query(default=500, ge=1, le=5000),
    explicit: bool = True,
    semantic: bool = False,
    reasoned: bool = False,
    threshold: float = Query(default=0.25, ge=0, le=1),
    session: Session = Depends(get_db_session),
) -> GraphNeighborhood:
    require_vault(session)
    center_exists = session.scalar(
        select(Note.id).where(Note.id == center_id, Note.archived_at.is_(None))
    )
    if center_exists is None:
        raise VaultError("note_not_found", f"Note {center_id} was not found.", 404)
    nodes, edges, truncated = get_neighborhood(
        session, center_id, depth, limit, explicit, semantic, reasoned, threshold
    )
    session.commit()
    return GraphNeighborhood(
        center_id=center_id,
        depth=depth,
        nodes=nodes,
        edges=edges,
        truncated=truncated,
    )


@router.get("/overview", response_model=GraphOverview)
def graph_overview(
    limit: int = Query(default=200, ge=1, le=5000),
    explicit: bool = True,
    semantic: bool = False,
    reasoned: bool = False,
    threshold: float = Query(default=0.25, ge=0, le=1),
    session: Session = Depends(get_db_session),
) -> GraphOverview:
    require_vault(session)
    total_nodes, nodes, edges, truncated = get_overview(
        session, limit, explicit, semantic, reasoned, threshold
    )
    session.commit()
    return GraphOverview(
        total_nodes=total_nodes,
        nodes=nodes,
        edges=edges,
        truncated=truncated,
    )


@router.post("/layout", response_model=GraphLayoutResult)
def store_graph_layout(
    payload: GraphLayoutSave,
    session: Session = Depends(get_db_session),
) -> GraphLayoutResult:
    require_vault(session)
    return GraphLayoutResult(saved=save_layout(session, payload.positions))


@router.delete("/layout", response_model=GraphLayoutResetResult)
def reset_graph_layout(session: Session = Depends(get_db_session)) -> GraphLayoutResetResult:
    require_vault(session)
    clear_layout(session)
    return GraphLayoutResetResult(reset=True)
