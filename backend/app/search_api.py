from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session, selectinload

from app.api_common import get_db_session, get_note, require_vault, summarize_note
from app.models import Link, Note, NoteTag, Revision, Tag
from app.schemas import (
    BacklinkList,
    LinkOut,
    RevisionDetail,
    RevisionList,
    RevisionSummary,
    SearchResponse,
    SearchResult,
    TagOut,
)
from app.services.index import parse_search_query
from app.services.vault import VaultError

router = APIRouter(prefix="/api", tags=["search and history"])


@router.get("/notes/{note_id}/backlinks", response_model=BacklinkList)
def backlinks(
    note_id: int,
    session: Session = Depends(get_db_session),
) -> BacklinkList:
    get_note(session, note_id)
    notes = session.scalars(
        select(Note)
        .join(Link, Link.source_id == Note.id)
        .options(selectinload(Note.note_tags).selectinload(NoteTag.tag))
        .where(Link.target_id == note_id)
        .order_by(Note.title)
    ).all()
    return BacklinkList(items=[summarize_note(note) for note in notes])


@router.get("/notes/{note_id}/links", response_model=list[LinkOut])
def note_links(
    note_id: int,
    session: Session = Depends(get_db_session),
) -> list[LinkOut]:
    get_note(session, note_id)
    links = session.scalars(select(Link).where(Link.source_id == note_id)).all()
    return [LinkOut.model_validate(link, from_attributes=True) for link in links]


@router.get("/notes/{note_id}/revisions", response_model=RevisionList)
def list_revisions(
    note_id: int,
    session: Session = Depends(get_db_session),
) -> RevisionList:
    get_note(session, note_id)
    revisions = session.scalars(
        select(Revision)
        .where(Revision.note_id == note_id)
        .order_by(Revision.created_at.desc(), Revision.id.desc())
    ).all()
    return RevisionList(
        items=[
            RevisionSummary(
                id=revision.id,
                note_id=revision.note_id,
                content_hash=revision.content_hash,
                created_at=revision.created_at,
            )
            for revision in revisions
        ]
    )


@router.get("/revisions/{revision_id}", response_model=RevisionDetail)
def get_revision(
    revision_id: int,
    session: Session = Depends(get_db_session),
) -> RevisionDetail:
    revision = session.get(Revision, revision_id)
    if revision is None:
        raise VaultError("revision_not_found", f"Revision {revision_id} was not found.", 404)
    return RevisionDetail(
        id=revision.id,
        note_id=revision.note_id,
        content_hash=revision.content_hash,
        created_at=revision.created_at,
        content=revision.content,
    )


@router.get("/tags", response_model=list[TagOut])
def list_tags(session: Session = Depends(get_db_session)) -> list[TagOut]:
    require_vault(session)
    rows = session.execute(
        select(Tag.name, func.count(NoteTag.note_id))
        .join(NoteTag, NoteTag.tag_id == Tag.id)
        .join(Note, Note.id == NoteTag.note_id)
        .where(Note.archived_at.is_(None))
        .group_by(Tag.id)
        .order_by(Tag.name)
    ).all()
    return [TagOut(name=name, count=count) for name, count in rows]


@router.get("/search", response_model=SearchResponse)
def search(
    q: str = Query(min_length=1, max_length=256),
    limit: int = Query(default=20, ge=1, le=100),
    session: Session = Depends(get_db_session),
) -> SearchResponse:
    require_vault(session)
    match_query = parse_search_query(q)
    if not match_query:
        return SearchResponse(items=[], query=q)
    rows = session.execute(
        text(
            """
            SELECT notes.id, snippet(notes_fts, 2, '<mark>', '</mark>', '…', 16) AS snippet
            FROM notes_fts
            JOIN notes ON CAST(notes_fts.note_id AS INTEGER) = notes.id
            WHERE notes_fts MATCH :match_query AND notes.archived_at IS NULL
            ORDER BY bm25(notes_fts)
            LIMIT :limit
            """
        ),
        {"match_query": match_query, "limit": limit},
    ).all()
    note_ids = [row.id for row in rows]
    notes = (
        session.scalars(
            select(Note)
            .options(selectinload(Note.note_tags).selectinload(NoteTag.tag))
            .where(Note.id.in_(note_ids))
        ).all()
        if note_ids
        else []
    )
    notes_by_id = {note.id: note for note in notes}
    items = [
        SearchResult(
            **summarize_note(notes_by_id[row.id]).model_dump(),
            snippet=row.snippet,
        )
        for row in rows
    ]
    return SearchResponse(items=items, query=q)
