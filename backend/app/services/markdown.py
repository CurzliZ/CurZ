from dataclasses import dataclass
from pathlib import PurePosixPath
import re
from typing import Any

import yaml

WIKILINK_RE = re.compile(r"\[\[([^\[\]]+)\]\]")
TAG_RE = re.compile(r"(?<![\w/])#([A-Za-z][\w/-]*)")


class MarkdownError(ValueError):
    pass


@dataclass(frozen=True)
class ParsedMarkdown:
    title: str
    body: str
    tags: tuple[str, ...]
    aliases: tuple[str, ...]
    wikilinks: tuple[tuple[str, str | None], ...]
    created: str | None


def _string_list(value: Any) -> tuple[str, ...]:
    if isinstance(value, str):
        values = [value]
    elif isinstance(value, list):
        values = value
    else:
        return ()
    return tuple(
        item.strip().lstrip("#")
        for item in values
        if isinstance(item, str) and item.strip().lstrip("#")
    )


def parse_markdown(content: str, path: str) -> ParsedMarkdown:
    frontmatter: dict[str, Any] = {}
    body = content
    if content.startswith("---\n") or content.startswith("---\r\n"):
        match = re.match(r"\A---\r?\n(.*?)\r?\n---(?:\r?\n|\Z)", content, re.DOTALL)
        if not match:
            raise MarkdownError("YAML frontmatter must end with a closing '---' line.")
        try:
            parsed = yaml.safe_load(match.group(1))
        except yaml.YAMLError as error:
            raise MarkdownError(f"Invalid YAML frontmatter: {error}") from error
        if not isinstance(parsed, dict):
            raise MarkdownError("YAML frontmatter must contain a mapping.")
        frontmatter = parsed
        body = content[match.end() :]

    pure_path = PurePosixPath(path)
    title_match = re.search(r"(?m)^\s*#\s+(.+?)\s*#*\s*$", body)
    title = str(frontmatter.get("title", "")).strip()
    if not title and title_match:
        title = title_match.group(1).strip()
    if not title:
        title = pure_path.stem.replace("-", " ").replace("_", " ").strip()

    tags = {tag.casefold(): tag for tag in _string_list(frontmatter.get("tags"))}
    for match in TAG_RE.finditer(body):
        tag = match.group(1)
        tags.setdefault(tag.casefold(), tag)

    wikilinks: list[tuple[str, str | None]] = []
    for match in WIKILINK_RE.finditer(body):
        target, separator, alias = match.group(1).partition("|")
        target = target.strip()
        if target:
            wikilinks.append((target, alias.strip() if separator and alias.strip() else None))

    created = frontmatter.get("created")
    return ParsedMarkdown(
        title=title[:512],
        body=body,
        tags=tuple(sorted(tags.values(), key=str.casefold)),
        aliases=_string_list(frontmatter.get("aliases")),
        wikilinks=tuple(wikilinks),
        created=str(created) if created is not None else None,
    )
