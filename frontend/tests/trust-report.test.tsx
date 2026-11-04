// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import { TrustReportPage } from "../src/pages/TrustReportPage";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TrustReportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

it("renders the measured values and labels mock-provider results", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      available: true,
      report: {
        status: "completed",
        date: "2026-11-03T12:00:00Z",
        mock: true,
        config: {
          provider: "mock",
          model: "mock",
          embedding_model: "",
          timeout_seconds: 120,
        },
        metrics: {
          raw_quote_fabrication: { rate: 0.125, numerator: 1, denominator: 8 },
          post_verification_citation_validity: { rate: 1, numerator: 8, denominator: 8 },
          relationship_precision: {
            rate: 0.14285714285714285,
            numerator: 1,
            denominator: 7,
          },
          relationship_recall: { rate: 0.25, numerator: 1, denominator: 4 },
          ask_retrieval_hit_at_k: { rate: 0.75, numerator: 3, denominator: 4, k: 8 },
          unanswerable_question_honesty: { rate: 1, numerator: 1, denominator: 1 },
        },
      },
    }),
  }));
  renderPage();

  expect(await screen.findByText("12.5%")).toBeTruthy();
  expect(screen.getAllByText("100.0%")).toHaveLength(2);
  expect(screen.getByText("75.0%")).toBeTruthy();
  expect(screen.getByText("MockProvider (mock results)")).toBeTruthy();
  expect(screen.getByText(/not evidence of real-model performance/i)).toBeTruthy();
  expect(screen.getByText("1 / 8 measured cases")).toBeTruthy();
  expect(screen.getByText("Exact rate value: 0.14285714285714285")).toBeTruthy();
});

it("shows the command when no evaluation has been run", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ available: false, report: null }),
  }));
  renderPage();

  expect(await screen.findByText("No evaluation report yet")).toBeTruthy();
  expect(screen.getByText("npm run eval")).toBeTruthy();
});
