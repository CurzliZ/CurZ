import { getNote, listNotes } from "@/services/api";
import type { NoteSummary } from "@/services/api";

export interface NoteListItem extends NoteSummary {
  snippet: string;
}

function stripMarkdown(content: string): string {
  return content
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, "$2$1")
    .replace(/[*_~`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function noteSnippet(content: string): string {
  return stripMarkdown(content).slice(0, 150);
}

export async function listNotesWithSnippets(
  options: Parameters<typeof listNotes>[0],
): Promise<{ items: NoteListItem[]; total: number }> {
  const page = await listNotes(options);
  const items: NoteListItem[] = [];
  for (let start = 0; start < page.items.length; start += 6) {
    const details = await Promise.all(
      page.items.slice(start, start + 6).map((note) => getNote(note.id)),
    );
    items.push(
      ...details.map((note) => ({ ...note, snippet: noteSnippet(note.content) })),
    );
  }
  return { items, total: page.total };
}
