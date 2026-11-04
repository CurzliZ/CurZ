// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewPage } from "../src/pages/ReviewPage";

const aiService = vi.hoisted(() => ({ getAIHealth: vi.fn() }));
const relationshipService = vi.hoisted(() => ({
  decideRelationship: vi.fn(),
  generateRelationships: vi.fn(),
  getRelationshipTask: vi.fn(),
  getReviewRelationships: vi.fn(),
}));

vi.mock("../src/services/ai", () => aiService);
vi.mock("../src/services/relationships", () => relationshipService);

const tension = {
  id: 4,
  source_note_id: 1,
  source_title: "First idea",
  target_note_id: 2,
  target_title: "Second idea",
  relationship_type: "tension",
  explanation: "The notes frame a tradeoff differently.",
  confidence: 0.6,
  origin: "ai",
  state: "pending",
  created_at: "2026-10-24T10:00:00",
  evidence: [
    { note_id: 1, note_title: "First idea", quote: "First verified quote.", quote_start: 0, quote_end: 20, status: "verified" },
    { note_id: 2, note_title: "Second idea", quote: "Second verified quote.", quote_start: 0, quote_end: 21, status: "verified" },
  ],
};

describe("ReviewPage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    aiService.getAIHealth.mockResolvedValue({
      mock: true,
      reachable: true,
      chat_model_present: true,
    });
    relationshipService.getReviewRelationships.mockResolvedValue({ items: [tension] });
    relationshipService.decideRelationship.mockResolvedValue({ ...tension, state: "accepted" });
    relationshipService.generateRelationships.mockResolvedValue({ id: "task-1" });
  });

  it("shows a side-by-side tension with verified evidence and review actions", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter><ReviewPage /></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("First verified quote.")).toBeTruthy();
    expect(screen.getByText("What seems to conflict")).toBeTruthy();
    expect(screen.getByText("Why both could be true")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));
    await waitFor(() => {
      expect(relationshipService.decideRelationship).toHaveBeenCalledWith(4, { action: "accept" });
    });
  });

  it("handles dismiss and defer decisions", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter><ReviewPage /></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("First verified quote.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Dismiss/ }));
    await waitFor(() => {
      expect(relationshipService.decideRelationship).toHaveBeenCalledWith(4, { action: "dismiss" });
    });

    fireEvent.click(screen.getByRole("button", { name: /Defer/ }));
    await waitFor(() => {
      expect(relationshipService.decideRelationship).toHaveBeenCalledWith(4, { action: "defer" });
    });
  });

  it("allows editing a proposal before accepting", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter><ReviewPage /></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("First verified quote.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByText("Save & accept")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Save & accept/ }));

    await waitFor(() => {
      expect(relationshipService.decideRelationship).toHaveBeenCalledWith(4, {
        action: "edit",
        relationship_type: "tension",
        explanation: "The notes frame a tradeoff differently.",
        source_quote: "First verified quote.",
        target_quote: "Second verified quote.",
      });
    });
  });

  it("disables direct accept when evidence is stale", async () => {
    const staleTension = {
      ...tension,
      state: "outdated",
      evidence: [
        { note_id: 1, note_title: "First idea", quote: "Old quote.", quote_start: 0, quote_end: 10, status: "stale" },
        { note_id: 2, note_title: "Second idea", quote: "Second verified quote.", quote_start: 0, quote_end: 21, status: "verified" },
      ],
    };
    relationshipService.getReviewRelationships.mockResolvedValue({ items: [staleTension] });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter><ReviewPage /></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("What seems to conflict")).toBeTruthy();
    const acceptBtn = screen.getByRole("button", { name: /Accept/ });
    expect((acceptBtn as HTMLButtonElement).disabled).toBe(true);
  });
});
