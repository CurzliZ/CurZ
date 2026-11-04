import { describe, expect, it } from "vitest";

import { getWikilinkCompletions, resolveWikilink } from "../src/lib/wikilinks";
import type { NoteTarget } from "../src/services/api";

const targets: NoteTarget[] = [
  { id: 3, title: "Learning in public", aliases: ["Public learning", "Open notes"] },
  { id: 4, title: "Product thinking", aliases: ["Product craft"] },
];

describe("wikilink suggestions", () => {
  it("offers real note titles and aliases that match the typed query", () => {
    expect(getWikilinkCompletions("pub", targets)).toEqual([
      { label: "Learning in public", title: "Learning in public" },
      { label: "Public learning", title: "Learning in public", alias: "Public learning" },
    ]);
  });

  it("resolves links by title or alias and leaves unknown notes unresolved", () => {
    expect(resolveWikilink("Open notes|my label", targets)?.id).toBe(3);
    expect(resolveWikilink("A note not written yet", targets)).toBeUndefined();
  });
});
