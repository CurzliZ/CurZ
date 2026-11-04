import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Link, Note
from app.phase12_schemas import GapItem, GapsResponse
from app.services.vault import VaultError, get_vault_root, resolve_note_path

MAX_GAP_ITEMS = 200
QUESTION_PREFIX = re.compile(r"^\s{0,3}(?:[-*+]\s*)?(?:TODO|QUESTION)\b\s*:?\s*", re.I)
MARKDOWN_PREFIX = re.compile(r"^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)")


def _normalized_phrase(value: str) -> str:
    value = MARKDOWN_PREFIX.sub("", value)
    value = QUESTION_PREFIX.sub("", value)
    return " ".join(re.sub(r"[^\w\s]", " ", value.casefold()).split())


def _question_phrase(value: str) -> str:
    if ":" in value and "?" in value and value.index(":") < value.index("?"):
        value = value.split(":", 1)[1]
    return _normalized_phrase(value)


def collect_gaps(session: Session) -> GapsResponse:
    root = get_vault_root(session)
    if root is None:
        return GapsResponse(orphans=[], open_questions=[], truncated=False)
    notes = session.scalars(
        select(Note).where(Note.archived_at.is_(None)).order_by(Note.id)
    ).all()
    ids = {note.id for note in notes}
    linked: set[int] = set()
    for source, target in session.execute(
        select(Link.source_id, Link.target_id).where(
            Link.source_id.in_(ids),
            Link.target_id.in_(ids),
        )
    ):
        linked.add(source)
        if target is not None:
            linked.add(target)

    contents: dict[int, str] = {}
    paths: dict[int, str] = {}
    for note in notes:
        path = resolve_note_path(root, note.path)
        if not path.is_file():
            raise VaultError("note_file_missing", f"Note '{note.path}' is missing.", 409)
        try:
            contents[note.id] = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            raise VaultError("note_unavailable", f"Note '{note.path}' could not be read.", 409) from error
        paths[note.id] = note.path
    normalized_contents = {
        note_id: _normalized_phrase(content)
        for note_id, content in contents.items()
    }

    orphans = [
        GapItem(
            note_id=note.id,
            title=note.title,
            path=note.path,
            text="No explicit incoming or outgoing links.",
            kind="orphan",
        )
        for note in notes
        if note.id not in linked
    ]
    questions: list[GapItem] = []
    for note in notes:
        content = contents.get(note.id)
        if content is None:
            continue
        for line in content.splitlines():
            candidate = line.strip()
            if not candidate or not (
                candidate.rstrip().endswith("?") or QUESTION_PREFIX.match(candidate)
            ):
                continue
            phrase = _question_phrase(candidate)
            if len(phrase) < 4:
                continue
            mentioned_elsewhere = any(
                phrase in other
                for other_id, other in normalized_contents.items()
                if other_id != note.id
            )
            if mentioned_elsewhere:
                continue
            questions.append(
                GapItem(
                    note_id=note.id,
                    title=note.title,
                    path=paths[note.id],
                    text=candidate[:500],
                    kind="open_question",
                )
            )

    truncated = len(orphans) + len(questions) > MAX_GAP_ITEMS
    return GapsResponse(
        orphans=orphans[:MAX_GAP_ITEMS],
        open_questions=questions[:MAX_GAP_ITEMS],
        truncated=truncated,
    )
