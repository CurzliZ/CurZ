import type { NoteTarget } from "@/services/api";

export interface WikilinkCompletion {
  label: string;
  title: string;
  alias?: string;
}

export function getWikilinkCompletions(
  query: string,
  targets: NoteTarget[],
): WikilinkCompletion[] {
  const normalized = query.trim().toLocaleLowerCase();
  const seen = new Set<string>();
  const matches: WikilinkCompletion[] = [];
  for (const target of targets) {
    for (const alias of [target.title, ...target.aliases]) {
      const key = alias.toLocaleLowerCase();
      if (!key.includes(normalized) || seen.has(key)) continue;
      seen.add(key);
      matches.push({
        label: alias,
        title: target.title,
        ...(alias === target.title ? {} : { alias }),
      });
    }
  }
  return matches;
}

export function resolveWikilink(
  value: string,
  targets: NoteTarget[],
): NoteTarget | undefined {
  const key = value.split("|", 1)[0].trim().toLocaleLowerCase();
  return targets.find((target) =>
    [target.title, ...target.aliases].some(
      (candidate) => candidate.toLocaleLowerCase() === key,
    ),
  );
}

export function readAliases(content: string): string[] {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return [];
  const lines = match[1].split(/\r?\n/);
  const index = lines.findIndex((line) => /^aliases:\s*/.test(line));
  if (index < 0) return [];
  const first = lines[index].replace(/^aliases:\s*/, "").trim();
  if (first.startsWith("[") && first.endsWith("]")) {
    return first
      .slice(1, -1)
      .split(",")
      .map(unquote)
      .filter(Boolean);
  }
  if (first) return [unquote(first)];
  const values: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (/^[A-Za-z][\w-]*\s*:/.test(line)) break;
    const item = line.match(/^\s+-\s+(.+)$/);
    if (item) values.push(unquote(item[1]));
  }
  return values;
}

function unquote(value: string): string {
  return value.trim().replace(/^(['"])(.*)\1$/, "$2");
}
