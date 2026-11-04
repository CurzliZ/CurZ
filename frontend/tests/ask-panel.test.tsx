// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AskPanel } from "../src/components/AskPanel";
import { useWorkspaceUi } from "../src/stores/workspace-ui";

const aiService = vi.hoisted(() => ({ getAIHealth: vi.fn() }));
const askService = vi.hoisted(() => ({
  cancelAskTask: vi.fn(),
  getAskScopes: vi.fn(),
  getAskTask: vi.fn(),
  startAsk: vi.fn(),
}));

vi.mock("../src/services/ai", () => aiService);
vi.mock("../src/services/ask", () => askService);

describe("AskPanel", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    aiService.getAIHealth.mockResolvedValue({
      mock: true,
      reachable: true,
      chat_model_present: true,
    });
    askService.getAskScopes.mockResolvedValue({ folders: ["research"], tags: ["science"] });
    useWorkspaceUi.getState().setSelectedNoteId(5);
    useWorkspaceUi.getState().setAskOpen(true);
  });

  it("defaults the retrieval scope to the currently selected note", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter><AskPanel /></MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      const scope = screen.getByRole("combobox", { name: "Search scope" }) as HTMLSelectElement;
      expect(scope.value).toBe("current_note");
    });
  });
});
