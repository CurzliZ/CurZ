from datetime import UTC, datetime, timedelta
import hashlib
from pathlib import Path
import re

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.ai.claims import reverify_note_evidence
from app.services.relationships import reverify_relationship_evidence
from app.models import Link, Note, NoteTag, Revision, Tag, utc_now
from app.services.markdown import MarkdownError, ParsedMarkdown, parse_markdown
from app.services.retrieval import refresh_retrieval_chunks
from app.services.vault import VaultError, relative_vault_path, resolve_note_path

REVISION_INTERVAL = timedelta(seconds=60)


def content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _set_tags(session: Session, note: Note, names: tuple[str, ...]) -> None:
    session.execute(delete(NoteTag).where(NoteTag.note_id == note.id))
    for name in names:
        normalized = name.casefold()
        tag = session.scalar(select(Tag).where(Tag.name == normalized))
        if tag is None:
            tag = Tag(name=normalized)
            session.add(tag)
            session.flush()
        session.add(NoteTag(note_id=note.id, tag_id=tag.id))
    session.flush()
    orphan_ids = select(Tag.id).outerjoin(NoteTag).where(NoteTag.id.is_(None))
    session.execute(delete(Tag).where(Tag.id.in_(orphan_ids)))


def _refresh_links(session: Session, root: Path) -> None:
    lookup: dict[str, Note] = {}
    notes = session.scalars(select(Note)).all()
    parsed_by_id: dict[int, ParsedMarkdown] = {}
    for note in notes:
        parsed = parse_markdown(
            resolve_note_path(root, note.path).read_text(encoding="utf-8"),
            note.path,
        )
        parsed_by_id[note.id] = parsed
        note_path = Path(note.path).with_suffix("").as_posix()
        for candidate in {
            note.title,
            Path(note.path).stem,
            note_path,
            note.path,
            *parsed.aliases,
        }:
            lookup.setdefault(candidate.casefold(), note)

    session.execute(delete(Link))
    for note in notes:
        parsed = parsed_by_id[note.id]
        for target, alias in parsed.wikilinks:
            resolved = lookup.get(target.casefold())
            session.add(
                Link(
                    source_id=note.id,
                    target_id=resolved.id if resolved else None,
                    target_text=None if resolved else target,
                    alias=alias,
                )
            )


def _refresh_fts(session: Session, note: Note, parsed: ParsedMarkdown, archived: bool) -> None:
    session.execute(
        text("DELETE FROM notes_fts WHERE note_id = :note_id"), {"note_id": str(note.id)}
    )
    if not archived:
        session.execute(
            text(
                "INSERT INTO notes_fts (note_id, title, body) "
                "VALUES (:note_id, :title, :body)"
            ),
            {"note_id": str(note.id), "title": note.title, "body": parsed.body},
        )


def refresh_note(
    session: Session,
    root: Path,
    relative_path: str,
    content: str,
    previous_content: str | None = None,
    force_revision: bool = False,
    refresh_links: bool = True,
) -> Note:
    parsed = parse_markdown(content, relative_path)
    digest = content_hash(content)
    note = session.scalar(select(Note).where(Note.path == relative_path))
    now = utc_now()
    if note is None:
        created_at = now
        if parsed.created:
            try:
                created_at = datetime.fromisoformat(
                    parsed.created.replace("Z", "+00:00")
                )
                if created_at.tzinfo is not None:
                    created_at = created_at.astimezone(UTC).replace(tzinfo=None)
            except ValueError as error:
                raise MarkdownError(
                    "Frontmatter 'created' must be a valid ISO date or datetime."
                ) from error
        note = Note(
            path=relative_path,
            title=parsed.title,
            content_hash=digest,
            created_at=created_at,
            updated_at=now,
        )
        session.add(note)
        session.flush()
    elif note.content_hash != digest:
        if previous_content is not None and (
            force_revision or _should_snapshot(session, note.id, now)
        ):
            session.add(
                Revision(
                    note_id=note.id,
                    content_hash=note.content_hash,
                    content=previous_content,
                    created_at=now,
                )
            )
        note.title = parsed.title
        note.content_hash = digest
        note.updated_at = now
        reverify_note_evidence(session, note, content)
        reverify_relationship_evidence(session, note, content)
    else:
        note.title = parsed.title

    _set_tags(session, note, parsed.tags)
    _refresh_fts(session, note, parsed, note.archived_at is not None)
    refresh_retrieval_chunks(session, note, content, note.archived_at is not None)
    session.flush()
    if refresh_links:
        _refresh_links(session, root)
        session.flush()
    return note


def _should_snapshot(session: Session, note_id: int, now) -> bool:
    latest = session.scalar(
        select(Revision.created_at)
        .where(Revision.note_id == note_id)
        .order_by(Revision.created_at.desc())
        .limit(1)
    )
    return latest is None or now - latest >= REVISION_INTERVAL


def rescan_vault(session: Session, root: Path) -> dict[str, int]:
    disk_files: dict[str, Path] = {}
    for path in root.rglob("*.md"):
        if path.is_file() and not path.is_symlink():
            relative = relative_vault_path(root, path)
            resolved = resolve_note_path(root, relative)
            disk_files[relative] = resolved

    indexed = {note.path: note for note in session.scalars(select(Note)).all()}
    removed = set(indexed) - set(disk_files)
    for relative in removed:
        note = indexed[relative]
        session.execute(
            text("DELETE FROM notes_fts WHERE note_id = :note_id"),
            {"note_id": str(note.id)},
        )
        session.delete(note)
    session.flush()

    created = 0
    changed = 0
    for relative, path in disk_files.items():
        content = path.read_text(encoding="utf-8")
        current = indexed.get(relative)
        if current is None:
            created += 1
        elif current.content_hash != content_hash(content):
            changed += 1
        refresh_note(session, root, relative, content, refresh_links=False)

    _refresh_links(session, root)
    orphan_tags = select(Tag.id).outerjoin(NoteTag).where(NoteTag.id.is_(None))
    session.execute(delete(Tag).where(Tag.id.in_(orphan_tags)))
    session.commit()
    return {"created": created, "changed": changed, "deleted": len(removed)}


def update_archive_index(session: Session, note: Note, root: Path) -> None:
    content = resolve_note_path(root, note.path).read_text(encoding="utf-8")
    parsed = parse_markdown(content, note.path)
    _refresh_fts(session, note, parsed, note.archived_at is not None)
    refresh_retrieval_chunks(session, note, content, note.archived_at is not None)


def parse_search_query(query: str) -> str:
    terms = re.findall(r"[\w-]+", query, flags=re.UNICODE)
    if not terms:
        return ""
    return " AND ".join(f'"{term.replace(chr(34), chr(34) * 2)}"' for term in terms)
