// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EvidencePanel } from "../src/components/EvidencePanel";
import { useWorkspaceUi } from "../src/stores/workspace-ui";

const aiService = vi.hoisted(() => ({
  extractNoteClaims: vi.fn(),
  getAIHealth: vi.fn(),
  getAITask: vi.fn(),
  getNoteClaims: vi.fn(),
  removeNoteClaim: vi.fn(),
}));

const apiService = vi.hoisted(() => ({
  getNote: vi.fn(),
}));

vi.mock("../src/services/ai", () => aiService);
vi.mock("../src/services/api", () => apiService);

describe("EvidencePanel", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    aiService.getAIHealth.mockResolvedValue({
      provider: "ollama",
      reachable: true,
      chat_model: "local-model",
      chat_model_present: true,
      embedding_model: "",
      embedding_model_present: false,
      chat_model_error: null,
      embedding_model_error: null,
      mock: false,
      error: null,
    });
    aiService.getNoteClaims.mockResolvedValue({
      note_id: 5,
      claims: [{
        id: 8,
        text: "The source supports this statement.",
        state: "verified",
        interpretation: false,
        mock: false,
        evidence: [{
          id: 12,
          heading: "Source",
          quote: "A verifiable quote.",
          quote_start: 0,
          quote_end: 20,
          source_hash: "hash",
          status: "verified",
        }],
      }],
      stats: { raw_quotes: 1, verified_quotes: 1 },
    });
    apiService.getNote.mockResolvedValue({
      id: 5,
      content: "A verifiable quote.",
      title: "Evidence note",
    });
    useWorkspaceUi.getState().setSelectedNoteId(5);
  });

  it("renders verified evidence and exposes a show-in-note target", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <EvidencePanel />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("The source supports this statement.")).toBeTruthy();
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(screen.getByText("Verified 1 of 1 quotes.")).toBeTruthy();
    fireEvent.click(screen.getByText("View verified quote"));
    fireEvent.click(screen.getByRole("button", { name: "Show in note" }));
    expect(useWorkspaceUi.getState().evidenceTarget).toMatchObject({
      noteId: 5,
      start: 0,
      end: 19,
    });
  });

  it("disables extraction with a reason when local AI is unavailable", async () => {
    aiService.getAIHealth.mockResolvedValue({
      provider: "ollama",
      reachable: false,
      chat_model: "",
      chat_model_present: false,
      embedding_model: "",
      embedding_model_present: false,
      chat_model_error: "Could not reach Ollama.",
      embedding_model_error: "Could not reach Ollama.",
      mock: false,
      error: "Could not reach Ollama.",
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <EvidencePanel />
      </QueryClientProvider>,
    );

    const button = await screen.findByRole("button", { name: "Extract claims" });
    expect(screen.getByText("Connect Ollama in Settings to extract claims.")).toBeTruthy();
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
