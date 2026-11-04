function splitFrontmatter(content: string): { yaml: string | null; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { yaml: null, body: content };
  return { yaml: match[1], body: content.slice(match[0].length) };
}

export function readNoteTitle(content: string, fallback: string): string {
  const { yaml, body } = splitFrontmatter(content);
  const frontmatterTitle = yaml?.match(/^title:\s*(.+)$/m)?.[1];
  if (frontmatterTitle) return frontmatterTitle.trim().replace(/^(['"])(.*)\1$/, "$2");
  return body.match(/^\s{0,3}#\s+(.+?)\s*#*\s*$/m)?.[1]?.trim() ?? fallback;
}

export function updateNoteTitle(content: string, title: string): string {
  const cleanTitle = title.replace(/[\r\n]/g, " ").trim();
  const { yaml, body } = splitFrontmatter(content);
  if (yaml !== null) {
    const nextYaml = /^title:\s*.*$/m.test(yaml)
      ? yaml.replace(/^title:\s*.*$/m, `title: ${JSON.stringify(cleanTitle)}`)
      : yaml;
    const metadata = nextYaml === yaml && !/^title:\s*.*$/m.test(yaml)
      ? `${yaml}\ntitle: ${JSON.stringify(cleanTitle)}`
      : nextYaml;
    const frontmatter = `---\n${metadata}\n---\n`;
    const headingUpdated = /^(\s{0,3}#\s+).+$/m.test(body)
      ? body.replace(/^(\s{0,3}#\s+).+$/m, `$1${cleanTitle}`)
      : `# ${cleanTitle}\n\n${body}`;
    return `${frontmatter}${headingUpdated}`;
  }
  return /^(\s{0,3}#\s+).+$/m.test(content)
    ? content.replace(/^(\s{0,3}#\s+).+$/m, `$1${cleanTitle}`)
    : `# ${cleanTitle}\n\n${content}`;
}

export function updateFrontmatterTags(content: string, tags: string[]): string {
  const cleanTags = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
  const { yaml, body } = splitFrontmatter(content);
  if (yaml === null) {
    return cleanTags.length
      ? `---\ntags: ${JSON.stringify(cleanTags)}\n---\n${content}`
      : content;
  }

  const lines = yaml.split(/\r?\n/);
  const tagLine = lines.findIndex((line) => /^tags:\s*/.test(line));
  if (tagLine >= 0) {
    let end = tagLine + 1;
    while (end < lines.length && /^\s+-\s+/.test(lines[end])) end += 1;
    lines.splice(tagLine, end - tagLine);
  }
  if (cleanTags.length) lines.push(`tags: ${JSON.stringify(cleanTags)}`);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

export function readNoteTags(content: string, fallback: string[] = []): string[] {
  const { yaml, body } = splitFrontmatter(content);
  const tags = new Map(fallback.map((tag) => [tag.toLocaleLowerCase(), tag]));
  const tagValue = yaml?.match(/^tags:\s*(.*)$/m);
  if (tagValue) {
    const value = tagValue[1].trim();
    const items = value.startsWith("[") && value.endsWith("]")
      ? value.slice(1, -1).split(",")
      : value
        ? [value]
        : (yaml?.slice((tagValue.index ?? 0) + tagValue[0].length).match(/^\s+-\s+(.+)$/gm) ?? [])
          .map((line) => line.replace(/^\s+-\s+/, ""));
    for (const item of items) {
      const tag = item.trim().replace(/^(['"])(.*)\1$/, "$2").replace(/^#/, "");
      if (tag) tags.set(tag.toLocaleLowerCase(), tag);
    }
  }
  for (const match of body.matchAll(/(?<![\w/])#([A-Za-z][\w/-]*)/g)) {
    tags.set(match[1].toLocaleLowerCase(), match[1]);
  }
  return [...tags.values()].sort((a, b) => a.localeCompare(b));
}

export function removeHashtag(content: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.replace(new RegExp(`(^|\\s)#${escaped}(?=$|[^\\w/-])`, "gi"), "$1");
}
