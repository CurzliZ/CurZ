import re

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api_common import get_db_session, get_note, require_vault, summarize_note
from app.models import Note, NoteTag, Tag, utc_now
from app.schemas import DeletedResponse, NoteCreate, NoteDetail, NoteList, NoteSummary, NoteUpdate
from app.services.index import refresh_note, rescan_vault, update_archive_index
from app.services.markdown import parse_markdown
from app.services.vault import (
    VaultError,
    atomic_write,
    relative_vault_path,
    resolve_note_path,
)

router = APIRouter(prefix="/api", tags=["notes"])


def _slug(title: str) -> str:
    slug = re.sub(r"[^\w-]+", "-", title.strip(), flags=re.UNICODE).strip("-").casefold()
    return slug or "untitled"


def _content_with_title(content: str, title: str | None) -> str:
    if title and not re.search(r"(?m)^\s*#\s+", content):
        heading = title.strip().replace("\r", " ").replace("\n", " ")
        if content.startswith("---\n") or content.startswith("---\r\n"):
            closing = re.search(r"(?m)^---[ \t]*\r?$", content.split("\n", 1)[1])
            if closing:
                offset = content.index("\n") + 1 + closing.end()
                return f"{content[:offset]}\n# {heading}\n\n{content[offset:].lstrip()}"
        else:
            return f"# {heading}\n\n{content}"
    return content


@router.get("/notes", response_model=NoteList)
def list_notes(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    tag: str | None = None,
    archived: bool = False,
    sort: str = Query(default="updated_at", pattern="^(updated_at|created_at|title)$"),
    session: Session = Depends(get_db_session),
) -> NoteList:
    require_vault(session)
    archive_filter = Note.archived_at.is_not(None) if archived else Note.archived_at.is_(None)
    query = (
        select(Note)
        .options(selectinload(Note.note_tags).selectinload(NoteTag.tag))
        .where(archive_filter)
    )
    total_query = select(func.count(func.distinct(Note.id))).select_from(Note).where(
        archive_filter
    )
    if tag:
        tag_filter = Tag.name == tag.casefold()
        query = query.join(Note.note_tags).join(NoteTag.tag).where(tag_filter)
        total_query = total_query.join(Note.note_tags).join(NoteTag.tag).where(tag_filter)
    total = int(session.scalar(total_query) or 0)
    order_column = getattr(Note, sort)
    query = query.order_by(order_column.asc() if sort == "title" else order_column.desc())
    if sort != "title":
        query = query.order_by(Note.id.desc())
    notes = session.scalars(query.distinct().offset(offset).limit(limit)).all()
    return NoteList(
        items=[summarize_note(note) for note in notes],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/notes", response_model=NoteDetail, status_code=status.HTTP_201_CREATED)
def create_note(
    request: NoteCreate,
    session: Session = Depends(get_db_session),
) -> NoteDetail:
    root = require_vault(session)
    content = _content_with_title(request.content, request.title)
    parsed = parse_markdown(content, request.path or "untitled.md")
    requested_path = request.path or f"{_slug(request.title or parsed.title)}.md"
    path = resolve_note_path(root, requested_path)
    relative = relative_vault_path(root, path)
    if path.exists() or session.scalar(select(Note.id).where(Note.path == relative)) is not None:
        raise VaultError("note_path_exists", "A note already exists at this path.", 409)
    atomic_write(path, content)
    note = refresh_note(session, root, relative, content)
    session.commit()
    return NoteDetail(**summarize_note(note).model_dump(), content=content)


@router.get("/notes/{note_id}", response_model=NoteDetail)
def get_note_detail(
    note_id: int,
    session: Session = Depends(get_db_session),
) -> NoteDetail:
    root = require_vault(session)
    note = get_note(session, note_id)
    path = resolve_note_path(root, note.path)
    if not path.is_file():
        raise VaultError("note_file_missing", "The note file is missing; rescan the vault.", 409)
    content = path.read_text(encoding="utf-8")
    return NoteDetail(**summarize_note(note).model_dump(), content=content)


@router.put("/notes/{note_id}", response_model=NoteDetail)
def update_note(
    note_id: int,
    request: NoteUpdate,
    session: Session = Depends(get_db_session),
) -> NoteDetail:
    root = require_vault(session)
    note = get_note(session, note_id)
    path = resolve_note_path(root, note.path)
    if not path.is_file():
        raise VaultError("note_file_missing", "The note file is missing; rescan the vault.", 409)
    parse_markdown(request.content, note.path)
    previous_content = path.read_text(encoding="utf-8")
    note = refresh_note(session, root, note.path, previous_content)
    atomic_write(path, request.content)
    note = refresh_note(
        session,
        root,
        note.path,
        request.content,
        previous_content=previous_content,
        force_revision=request.force_revision,
    )
    session.commit()
    return NoteDetail(**summarize_note(note).model_dump(), content=request.content)


@router.post("/notes/{note_id}/archive", response_model=NoteSummary)
def archive_note(
    note_id: int,
    session: Session = Depends(get_db_session),
) -> NoteSummary:
    root = require_vault(session)
    note = get_note(session, note_id)
    if note.archived_at is None:
        note.archived_at = utc_now()
        update_archive_index(session, note, root)
        session.commit()
    return summarize_note(note)


@router.post("/notes/{note_id}/restore", response_model=NoteSummary)
def restore_note(
    note_id: int,
    session: Session = Depends(get_db_session),
) -> NoteSummary:
    root = require_vault(session)
    note = get_note(session, note_id)
    if note.archived_at is not None:
        note.archived_at = None
        update_archive_index(session, note, root)
        session.commit()
    return summarize_note(note)


@router.delete("/notes/{note_id}", response_model=DeletedResponse)
def delete_note(
    note_id: int,
    session: Session = Depends(get_db_session),
) -> DeletedResponse:
    root = require_vault(session)
    note = get_note(session, note_id)
    path = resolve_note_path(root, note.path)
    if path.exists():
        path.unlink()
    rescan_vault(session, root)
    return DeletedResponse(deleted=True)
