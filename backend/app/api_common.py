from collections.abc import Generator

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Note, NoteTag
from app.schemas import NoteSummary
from app.services.vault import VaultError, get_vault_root


def get_db_session(request: Request) -> Generator[Session, None, None]:
    factory = request.app.state.session_factory
    with factory() as session:
        yield session


def summarize_note(note: Note) -> NoteSummary:
    tags = sorted((link.tag.name for link in note.note_tags), key=str.casefold)
    return NoteSummary(
        id=note.id,
        path=note.path,
        title=note.title,
        content_hash=note.content_hash,
        created_at=note.created_at,
        updated_at=note.updated_at,
        archived_at=note.archived_at,
        tags=tags,
    )


def get_note(session: Session, note_id: int) -> Note:
    note = session.scalar(
        select(Note)
        .options(selectinload(Note.note_tags).selectinload(NoteTag.tag))
        .where(Note.id == note_id)
    )
    if note is None:
        raise VaultError("note_not_found", f"Note {note_id} was not found.", 404)
    return note


def require_vault(session: Session):
    root = get_vault_root(session)
    if root is None:
        raise VaultError("vault_not_open", "Open or create a vault before accessing notes.", 409)
    return root
