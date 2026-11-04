import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, getHealth } from "../src/services/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getHealth", () => {
  it("requests the proxied health endpoint and returns its typed response", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBe("/api/health");
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      });

      it("turns a failed fetch into actionable backend guidance", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
        await expect(getHealth()).rejects.toMatchObject({
          code: "backend_unreachable",
          message: "Could not reach the CurZ backend. Confirm both servers are running, then retry.",
        } satisfies Partial<ApiError>);
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getHealth()).resolves.toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
