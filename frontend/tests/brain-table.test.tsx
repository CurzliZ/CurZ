// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BrainTable } from "../src/components/brain/BrainTable";

afterEach(cleanup);

describe("BrainTable", () => {
  it("lists explicit links and lets keyboard users open notes", () => {
    const onOpenNote = vi.fn();
    render(
      <BrainTable
        nodes={[
          { id: 1, title: "First idea", degree: 1, created_at: "2026-04-10T12:00:00Z", x: null, y: null, position_saved: false },
          { id: 2, title: "Second idea", degree: 1, created_at: "2026-04-11T12:00:00Z", x: null, y: null, position_saved: false },
        ]}
        edges={[{ source: 1, target: 2, kind: "explicit" }]}
        onOpenNote={onOpenNote}
      />,
    );

    const noteButton = screen.getAllByRole("button", { name: "First idea" })[0];
    expect(noteButton.tabIndex).toBe(0);
    fireEvent.click(noteButton);
    expect(onOpenNote).toHaveBeenCalledWith(1);
    expect(screen.getByRole("table", { name: /explicit links/i })).toBeTruthy();
    expect(screen.getByText("Explicit")).toBeTruthy();
  });

  it("paginates large graph tables without removing keyboard access", () => {
    const nodes = Array.from({ length: 150 }, (_, index) => ({
      id: index + 1,
      title: `Note ${index + 1}`,
      degree: 0,
      created_at: "2026-04-10T12:00:00Z",
      x: null,
      y: null,
      position_saved: false,
    }));
    render(<BrainTable edges={[]} nodes={nodes} onOpenNote={vi.fn()} />);

    const notesTable = screen.getByRole("table", { name: /notes in this graph view/i });
    expect(within(notesTable).getAllByRole("row")).toHaveLength(101);
    fireEvent.click(screen.getByRole("button", { name: "Next notes" }));
    expect(screen.getByRole("button", { name: "Note 101" }).tabIndex).toBe(0);
    expect(screen.getByText("Notes 101–150 of 150")).toBeTruthy();
  }, 15_000);
});
