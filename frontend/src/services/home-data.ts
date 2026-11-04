import { getNote, listNotes } from "@/services/api";
import type { NoteSummary } from "@/services/api";
import { noteSnippet } from "@/services/note-list";

export async function getRecentNotes() {
  const summaries: NoteSummary[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (summaries.length < 5 && offset < total) {
    const page = await listNotes({ limit: 50, offset, sort: "updated_at" });
    summaries.push(
      ...page.items.filter((note) =>
        !note.path.replace(/\\/g, "/").toLocaleLowerCase().startsWith("inbox/"),
      ),
    );
    total = page.total;
    offset += page.items.length;
    if (!page.items.length) break;
  }
  const details = await Promise.all(summaries.slice(0, 5).map((note) => getNote(note.id)));
  return {
    items: details.map((note) => ({ ...note, snippet: noteSnippet(note.content) })),
    total,
  };
}

export async function getInboxNotes(): Promise<NoteSummary[]> {
  const inbox: NoteSummary[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (offset < total) {
    const page = await listNotes({ limit: 200, offset, sort: "updated_at" });
    inbox.push(
      ...page.items.filter((note) =>
        note.path.replace(/\\/g, "/").toLocaleLowerCase().startsWith("inbox/"),
      ),
    );
    total = page.total;
    offset += page.items.length;
    if (!page.items.length) break;
  }
  return inbox;
}
