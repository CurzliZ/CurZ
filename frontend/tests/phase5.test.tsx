// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandPalette } from "../src/components/CommandPalette";
import { QuickCaptureDialog } from "../src/components/QuickCapture";
import { ThemeProvider } from "../src/hooks/useTheme";
import { useWorkspaceUi } from "../src/stores/workspace-ui";

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>,
  );
}

function result(title: string, snippet: string) {
  return {
    query: "needle",
    items: [{
      id: 7,
      path: "ideas/needle.md",
      title,
      content_hash: "hash",
      created_at: "2026-10-23T12:00:00Z",
      updated_at: "2026-10-23T12:00:00Z",
      archived_at: null,
      tags: [],
      snippet,
    }],
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useWorkspaceUi.setState({ commandPaletteOpen: false, quickCaptureOpen: false });
  window.localStorage.clear();
});

beforeEach(() => {
  class TestResizeObserver implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) { void callback; }
    observe(target: Element) { void target; }
    unobserve(target: Element) { void target; }
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
});

describe("Phase 5 keyboard workflows", () => {
  it("opens the Evolution timeline from the command palette", () => {
    const onOpenEvolution = vi.fn();
    wrap(
      <CommandPalette
        onNewNote={vi.fn()}
        onNavigate={vi.fn()}
        onOpenChange={vi.fn()}
        onOpenNote={vi.fn()}
        onAsk={vi.fn()}
        onOpenEvolution={onOpenEvolution}
        onQuickCapture={vi.fn()}
        onRescan={vi.fn()}
        onToggleLens={vi.fn()}
        onToggleRail={vi.fn()}
        open
      />,
    );

    fireEvent.click(screen.getByRole("option", { name: /Evolution timeline/ }));

    expect(onOpenEvolution).toHaveBeenCalledOnce();
  });

  it("searches FTS results, highlights snippets, previews, and opens the selected note", async () => {
    const payload = result("Needle in the haystack", "A <mark>needle</mark> in the body.");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    });
    vi.stubGlobal("fetch", fetchMock);
    const onOpenNote = vi.fn();
    wrap(
      <CommandPalette
        onNewNote={vi.fn()}
        onNavigate={vi.fn()}
        onOpenChange={vi.fn()}
        onOpenNote={onOpenNote}
        onAsk={vi.fn()}
        onOpenEvolution={vi.fn()}
        onQuickCapture={vi.fn()}
        onRescan={vi.fn()}
        onToggleLens={vi.fn()}
        onToggleRail={vi.fn()}
        open
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search notes or run a command…"), {
      target: { value: "needle" },
    });
    const item = await screen.findByRole("option", { name: /Needle in the haystack/ });
    expect(screen.getAllByText("needle", { exact: true }).length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/search?q=needle&limit=50",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    fireEvent.click(item);
    expect(onOpenNote).toHaveBeenCalledWith(7);
  });

  it("does not show a late result from an older palette query", async () => {
    const fetchMock = vi.fn((url: string) => {
      const query = new URL(`http://localhost${url}`).searchParams.get("q");
      if (query === "slow") {
        return new Promise((resolve) => {
          window.setTimeout(() => resolve({
            ok: true,
            json: async () => result("Stale result", "slow response"),
          }), 100);
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => result("Fresh result", "current response"),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    wrap(
      <CommandPalette
        onNewNote={vi.fn()}
        onNavigate={vi.fn()}
        onOpenChange={vi.fn()}
        onOpenNote={vi.fn()}
        onAsk={vi.fn()}
        onOpenEvolution={vi.fn()}
        onQuickCapture={vi.fn()}
        onRescan={vi.fn()}
        onToggleLens={vi.fn()}
        onToggleRail={vi.fn()}
        open
      />,
    );
    const input = screen.getByPlaceholderText("Search notes or run a command…");
    fireEvent.change(input, { target: { value: "slow" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "fresh" } });
    expect(await screen.findByRole("option", { name: /Fresh result/ })).toBeTruthy();
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    expect(screen.queryByRole("option", { name: /Stale result/ })).toBeNull();
  });

  it("saves a Ctrl+Shift+N thought to a timestamped Inbox note on Enter", async () => {
    const savedNote = {
      id: 41,
      path: "Inbox/20261023T120000000Z.md",
      title: "Oct 23, 2026, 12:00 PM",
      content_hash: "hash",
      created_at: "2026-10-23T12:00:00Z",
      updated_at: "2026-10-23T12:00:00Z",
      archived_at: null,
      tags: [],
      content: "# Thought\n\nA captured idea\n",
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => init?.method === "POST"
        ? savedNote
        : { items: [], total: 0, limit: 200, offset: 0 },
    }));
    vi.stubGlobal("fetch", fetchMock);
    useWorkspaceUi.getState().setQuickCaptureOpen(true);
    wrap(<QuickCaptureDialog />);
    const textarea = screen.getByRole("textbox", { name: "Quick capture thought" });
    fireEvent.change(textarea, { target: { value: "A captured idea" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const createCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(createCall).toBeTruthy();
    const body = JSON.parse(String(createCall?.[1]?.body)) as { path: string; content: string };
    expect(body.path).toMatch(/^Inbox\/\d{8}T\d{9}Z\.md$/);
    expect(body.content).toContain("A captured idea");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
