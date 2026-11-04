from dataclasses import dataclass
import re
import unicodedata


@dataclass(frozen=True)
class VerifiedSpan:
    start: int
    end: int


_INLINE_LINK = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")
_LINE_MARKERS = re.compile(r"^\s{0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+[.)]\s+)")


def _strip_markdown(text: str) -> tuple[str, list[int]]:
    chars: list[str] = []
    positions: list[int] = []
    source_offset = 0
    for original_line in text.splitlines(keepends=True):
        content = original_line.rstrip("\r\n")
        prefix = _LINE_MARKERS.match(content)
        skip = prefix.end() if prefix else 0
        line = content[skip:]
        line_offset = source_offset + skip
        cursor = 0
        for match in _INLINE_LINK.finditer(line):
            for index in range(cursor, match.start()):
                if line[index] not in "*_~`":
                    chars.append(line[index])
                    positions.append(line_offset + index)
            for index in range(match.start(1), match.end(1)):
                if line[index] not in "*_~`":
                    chars.append(line[index])
                    positions.append(line_offset + index)
            cursor = match.end()
        for index in range(cursor, len(line)):
            if line[index] not in "*_~`":
                chars.append(line[index])
                positions.append(line_offset + index)
        if original_line.endswith(("\n", "\r")):
            chars.append("\n")
            positions.append(source_offset + len(original_line) - 1)
        source_offset += len(original_line)
    return "".join(chars), positions


_QUOTE_TRANSLATION = str.maketrans({
    "\u2018": "'", "\u2019": "'", "\u201a": "'", "\u201b": "'",
    "\u201c": '"', "\u201d": '"', "\u201e": '"', "\u201f": '"',
    "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-",
    "\u2014": "-", "\u2212": "-",
})


def _normalize(text: str) -> tuple[str, list[int]]:
    stripped, positions = _strip_markdown(text)
    result: list[str] = []
    mapping: list[int] = []
    pending_space: int | None = None
    for char, position in zip(stripped.translate(_QUOTE_TRANSLATION), positions):
        if char.isspace():
            if result:
                pending_space = position
            continue
        if pending_space is not None:
            result.append(" ")
            mapping.append(pending_space)
            pending_space = None
        normalized = unicodedata.normalize("NFKC", char).casefold()
        for normalized_char in normalized:
            result.append(normalized_char)
            mapping.append(position)
    return "".join(result), mapping


def verify_quote(note_text: str, quote: str) -> VerifiedSpan | None:
    normalized_note, positions = _normalize(note_text)
    normalized_quote, _ = _normalize(quote)
    if not normalized_quote:
        return None
    start = normalized_note.find(normalized_quote)
    if start < 0:
        return None
    end = start + len(normalized_quote)
    return VerifiedSpan(positions[start], positions[end - 1] + 1)
