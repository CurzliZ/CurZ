from sqlalchemy import func, or_, select, union_all
from sqlalchemy.orm import Session, aliased, selectinload

from app.models import Link, Note, Relationship
from app.schemas import GraphEdge, GraphNode, RelationshipEvidenceOut
from app.services.graph_layout import ensure_layout
from app.services.semantic import ensure_semantic_index, semantic_edges

MAX_GRAPH_NODES = 5000
MAX_GRAPH_EDGES = 50000


def _active_edges():
    target_note = aliased(Note)
    return (
        select(
            Link.source_id.label("source"),
            Link.target_id.label("target"),
        )
        .join(Note, Note.id == Link.source_id)
        .join(target_note, target_note.id == Link.target_id)
        .where(
            Link.target_id.is_not(None),
            Note.archived_at.is_(None),
            target_note.archived_at.is_(None),
        )
        .distinct()
        .subquery()
    )


def _degree_rows(edges):
    return union_all(
        select(edges.c.source.label("note_id")),
        select(edges.c.target.label("note_id")),
    ).subquery()


def _nodes_by_ids(
    session: Session,
    ids: list[int],
    include_reasoned: bool = False,
) -> dict[int, GraphNode]:
    edges = _active_edges()
    degree_rows = _degree_rows(edges)
    degrees = dict(
        session.execute(
            select(degree_rows.c.note_id, func.count())
            .where(degree_rows.c.note_id.in_(ids))
            .group_by(degree_rows.c.note_id)
        ).all()
    ) if ids else {}
    if include_reasoned and ids:
        target_note = aliased(Note)
        relation_degrees = union_all(
            select(Relationship.source_note_id.label("note_id"))
            .join(Note, Note.id == Relationship.source_note_id)
            .join(target_note, target_note.id == Relationship.target_note_id)
            .where(
                Relationship.source_note_id.in_(ids),
                Relationship.state.in_(("pending", "accepted")),
                Note.archived_at.is_(None),
                target_note.archived_at.is_(None),
            ),
            select(Relationship.target_note_id.label("note_id"))
            .join(Note, Note.id == Relationship.source_note_id)
            .join(target_note, target_note.id == Relationship.target_note_id)
            .where(
                Relationship.target_note_id.in_(ids),
                Relationship.state.in_(("pending", "accepted")),
                Note.archived_at.is_(None),
                target_note.archived_at.is_(None),
            ),
        ).subquery()
        for note_id, degree in session.execute(
            select(relation_degrees.c.note_id, func.count())
            .group_by(relation_degrees.c.note_id)
        ):
            degrees[note_id] = int(degrees.get(note_id, 0)) + int(degree)
    notes = session.scalars(select(Note).where(Note.id.in_(ids))).all() if ids else []
    return {
        note.id: GraphNode(
            id=note.id,
            title=note.title,
            degree=int(degrees.get(note.id, 0)),
            created_at=note.created_at,
        )
        for note in notes
    }


def _edges_for_nodes(
    session: Session,
    ids: list[int],
    include_explicit: bool,
    include_semantic: bool,
    include_reasoned: bool,
    threshold: float,
) -> tuple[list[GraphEdge], bool]:
    if not ids:
        return [], False
    rows = []
    if include_explicit:
        edges = _active_edges()
        rows = session.execute(
            select(edges.c.source, edges.c.target)
            .where(edges.c.source.in_(ids), edges.c.target.in_(ids))
            .order_by(edges.c.source, edges.c.target)
            .limit(MAX_GRAPH_EDGES + 1)
        ).all()
    truncated = len(rows) > MAX_GRAPH_EDGES
    result = [
        GraphEdge(source=source, target=target, kind="explicit")
        for source, target in rows[:MAX_GRAPH_EDGES]
    ]
    if include_semantic:
        result.extend(
            GraphEdge(source=source, target=target, kind="semantic", score=score)
            for source, target, score in semantic_edges(session, ids, threshold)
        )
    if include_reasoned:
        target_note = aliased(Note)
        rows = session.scalars(
            select(Relationship)
            .options(selectinload(Relationship.evidence))
            .join(Note, Note.id == Relationship.source_note_id)
            .join(target_note, target_note.id == Relationship.target_note_id)
            .where(
                Relationship.state.in_(("pending", "accepted")),
                Relationship.source_note_id.in_(ids),
                Relationship.target_note_id.in_(ids),
                Note.archived_at.is_(None),
                target_note.archived_at.is_(None),
            )
        ).all()
        for relation in rows:
            evidence_notes = {
                note.id: note.title
                for note in session.scalars(
                    select(Note).where(
                        Note.id.in_([item.note_id for item in relation.evidence])
                    )
                ).all()
            }
            source_note = session.get(Note, relation.source_note_id)
            target_note = session.get(Note, relation.target_note_id)
            result.append(
                GraphEdge(
                    source=relation.source_note_id,
                    target=relation.target_note_id,
                    kind="reasoned",
                    relationship_id=relation.id,
                    relationship_type=relation.relationship_type,
                    state=relation.state,
                    explanation=relation.explanation,
                    source_title=source_note.title if source_note else None,
                    target_title=target_note.title if target_note else None,
                    evidence=[
                        RelationshipEvidenceOut(
                            note_id=item.note_id,
                            note_title=evidence_notes.get(item.note_id, ""),
                            quote=item.quote,
                            quote_start=item.quote_start,
                            quote_end=item.quote_end,
                            status=item.status,
                        )
                        for item in relation.evidence
                    ],
                )
            )
    result.sort(key=lambda edge: (edge.source, edge.target, edge.kind))
    return result[:MAX_GRAPH_EDGES], truncated or len(result) > MAX_GRAPH_EDGES


def get_neighborhood(
    session: Session,
    center_id: int,
    depth: int,
    limit: int,
    include_explicit: bool = True,
    include_semantic: bool = False,
    include_reasoned: bool = False,
    threshold: float = 0.25,
) -> tuple[list[GraphNode], list[GraphEdge], bool]:
    center = session.scalar(
        select(Note.id).where(Note.id == center_id, Note.archived_at.is_(None))
    )
    if center is None:
        return [], [], False

    if include_semantic:
        ensure_semantic_index(session)
    all_ids = list(session.scalars(select(Note.id).where(Note.archived_at.is_(None))).all())
    semantic = semantic_edges(session, all_ids, threshold) if include_semantic else []
    semantic_neighbors: dict[int, set[int]] = {}
    for source, target, _score in semantic:
        semantic_neighbors.setdefault(source, set()).add(target)
        semantic_neighbors.setdefault(target, set()).add(source)
    reasoned_neighbors: dict[int, set[int]] = {}
    if include_reasoned:
        for source, target in session.execute(
            select(Relationship.source_note_id, Relationship.target_note_id).where(
                Relationship.state.in_(("pending", "accepted")),
                Relationship.source_note_id.in_(all_ids),
                Relationship.target_note_id.in_(all_ids),
            )
        ):
            reasoned_neighbors.setdefault(source, set()).add(target)
            reasoned_neighbors.setdefault(target, set()).add(source)

    edges = _active_edges()
    visited = [center_id]
    included = {center_id}
    frontier = {center_id}
    truncated = False

    for _ in range(depth):
        if not frontier:
            break
        rows = session.execute(
            select(edges.c.source, edges.c.target)
            .where(or_(edges.c.source.in_(frontier), edges.c.target.in_(frontier)))
            .order_by(edges.c.source, edges.c.target)
            .limit(MAX_GRAPH_EDGES + 1)
        ).all() if include_explicit else []
        if len(rows) > MAX_GRAPH_EDGES:
            truncated = True
            rows = rows[:MAX_GRAPH_EDGES]
        next_frontier: set[int] = set()
        for source, target in rows:
            neighbor = target if source in frontier else source
            if neighbor in included:
                continue
            if len(included) >= limit:
                truncated = True
                continue
            included.add(neighbor)
            visited.append(neighbor)
            next_frontier.add(neighbor)
        if include_semantic:
            for current_id in frontier:
                for neighbor in semantic_neighbors.get(current_id, set()):
                    if neighbor in included:
                        continue
                    if len(included) >= limit:
                        truncated = True
                        continue
                    included.add(neighbor)
                    visited.append(neighbor)
                    next_frontier.add(neighbor)
        if include_reasoned:
            for current_id in frontier:
                for neighbor in reasoned_neighbors.get(current_id, set()):
                    if neighbor in included:
                        continue
                    if len(included) >= limit:
                        truncated = True
                        continue
                    included.add(neighbor)
                    visited.append(neighbor)
                    next_frontier.add(neighbor)
        frontier = next_frontier

    nodes_by_id = _nodes_by_ids(session, visited, include_reasoned)
    graph_edges, edge_truncated = _edges_for_nodes(
        session, visited, include_explicit, include_semantic, include_reasoned, threshold
    )
    visible_semantic = [
        edge for edge in semantic if edge[0] in included and edge[1] in included
    ]
    ensure_layout(session, [nodes_by_id[note_id] for note_id in visited], visible_semantic)
    return [nodes_by_id[note_id] for note_id in visited], graph_edges, truncated or edge_truncated


def get_overview(
    session: Session,
    limit: int,
    include_explicit: bool = True,
    include_semantic: bool = False,
    include_reasoned: bool = False,
    threshold: float = 0.25,
) -> tuple[int, list[GraphNode], list[GraphEdge], bool]:
    if include_semantic:
        ensure_semantic_index(session)
    edges = _active_edges()
    degree_rows = _degree_rows(edges)
    if include_reasoned:
        target_note = aliased(Note)
        reasoned_degrees = union_all(
            select(Relationship.source_note_id.label("note_id"))
            .join(Note, Note.id == Relationship.source_note_id)
            .join(target_note, target_note.id == Relationship.target_note_id)
            .where(
                Relationship.state.in_(("pending", "accepted")),
                Note.archived_at.is_(None),
                target_note.archived_at.is_(None),
            ),
            select(Relationship.target_note_id.label("note_id"))
            .join(Note, Note.id == Relationship.source_note_id)
            .join(target_note, target_note.id == Relationship.target_note_id)
            .where(
                Relationship.state.in_(("pending", "accepted")),
                Note.archived_at.is_(None),
                target_note.archived_at.is_(None),
            ),
        ).subquery()
        degree_rows = union_all(
            select(degree_rows.c.note_id),
            select(reasoned_degrees.c.note_id),
        ).subquery()
    degrees = (
        select(degree_rows.c.note_id, func.count().label("degree"))
        .group_by(degree_rows.c.note_id)
        .subquery()
    )
    total_nodes = int(
        session.scalar(select(func.count(Note.id)).where(Note.archived_at.is_(None))) or 0
    )
    rows = session.execute(
        select(
            Note.id,
            Note.title,
            Note.created_at,
            func.coalesce(degrees.c.degree, 0).label("degree"),
        )
        .outerjoin(degrees, degrees.c.note_id == Note.id)
        .where(Note.archived_at.is_(None))
        .order_by(func.coalesce(degrees.c.degree, 0).desc(), Note.id.asc())
        .limit(limit)
    ).all()
    nodes = [
        GraphNode(id=row.id, title=row.title, degree=int(row.degree), created_at=row.created_at)
        for row in rows
    ]
    ids = [node.id for node in nodes]
    graph_edges, edge_truncated = _edges_for_nodes(
        session, ids, include_explicit, include_semantic, include_reasoned, threshold
    )
    semantic = semantic_edges(session, ids, threshold) if include_semantic else []
    ensure_layout(session, nodes, semantic)
    return total_nodes, nodes, graph_edges, total_nodes > len(nodes) or edge_truncated
