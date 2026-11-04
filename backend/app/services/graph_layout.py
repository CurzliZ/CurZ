from math import cos, pi, sin, sqrt

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import GraphLayout, Link, Note, SemanticNeighbor
from app.schemas import GraphNode, GraphLayoutPosition


def ensure_layout(
    session: Session,
    nodes: list[GraphNode],
    semantic_edges: list[tuple[int, int, float]],
) -> None:
    if not nodes:
        return
    ids = [node.id for node in nodes]
    positions = {
        row.note_id: (row.x, row.y)
        for row in session.scalars(select(GraphLayout).where(GraphLayout.note_id.in_(ids))).all()
    }
    saved_ids = set(positions)
    adjacency: dict[int, set[int]] = {note_id: set() for note_id in ids}
    explicit = session.execute(
        select(Link.source_id, Link.target_id)
        .join(Note, Note.id == Link.source_id)
        .where(
            Link.source_id.in_(ids),
            Link.target_id.in_(ids),
            Link.target_id.is_not(None),
            Note.archived_at.is_(None),
        )
    ).all()
    for source_id, target_id in explicit:
        adjacency[source_id].add(target_id)
        adjacency[target_id].add(source_id)
    for source_id, target_id, _score in semantic_edges:
        adjacency[source_id].add(target_id)
        adjacency[target_id].add(source_id)

    for index, node in enumerate(nodes):
        if node.id not in positions:
            neighbors = [positions[neighbor] for neighbor in adjacency[node.id] if neighbor in positions]
            if neighbors:
                x = sum(position[0] for position in neighbors) / len(neighbors)
                y = sum(position[1] for position in neighbors) / len(neighbors)
                angle = index * pi * (3 - sqrt(5))
                x += cos(angle) * 0.08
                y += sin(angle) * 0.08
            else:
                angle = index * pi * (3 - sqrt(5))
                radius = 0.4 * sqrt(index + 1)
                x = cos(angle) * radius
                y = sin(angle) * radius
            positions[node.id] = (x, y)
            session.add(GraphLayout(note_id=node.id, x=x, y=y))
        node.x, node.y = positions[node.id]
        node.position_saved = node.id in saved_ids
    session.flush()


def save_layout(session: Session, positions: list[GraphLayoutPosition]) -> int:
    note_ids = {item.note_id for item in positions}
    existing = {
        row.note_id: row
        for row in session.scalars(select(GraphLayout).where(GraphLayout.note_id.in_(note_ids))).all()
    } if note_ids else {}
    active_ids = set(session.scalars(select(Note.id).where(Note.id.in_(note_ids))).all()) if note_ids else set()
    for item in positions:
        if item.note_id not in active_ids:
            continue
        row = existing.get(item.note_id)
        if row is None:
            session.add(GraphLayout(note_id=item.note_id, x=item.x, y=item.y))
        else:
            row.x = item.x
            row.y = item.y
    session.commit()
    return len(active_ids)


def clear_layout(session: Session) -> None:
    session.execute(delete(GraphLayout))
    session.commit()
