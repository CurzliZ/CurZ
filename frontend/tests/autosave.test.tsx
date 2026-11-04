// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAutosave } from "../src/hooks/useAutosave";

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe("useAutosave", () => {
  it("moves through unsaved, saving, and saved states", async () => {
    vi.useFakeTimers();
    let finishSave: ((value: { content: string }) => void) | undefined;
    const save = vi.fn(
      () => new Promise<{ content: string }>((resolve) => {
        finishSave = resolve;
      }),
    );
    const { result } = renderHook(() =>
      useAutosave({ noteId: 1, initialContent: "", save, delay: 100 }),
    );

    act(() => result.current.setContent("# A thought"));
    expect(result.current.status).toBe("unsaved");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.status).toBe("saving");
    expect(save).toHaveBeenCalledWith(1, "# A thought");

    await act(async () => {
      finishSave?.({ content: "# A thought" });
      await Promise.resolve();
    });
    expect(result.current.status).toBe("saved");
  });

  it("keeps a failed draft and retries it without replacing editor content", async () => {
    vi.useFakeTimers();
    const save = vi.fn()
      .mockRejectedValueOnce(new Error("Backend is offline"))
      .mockResolvedValueOnce({ content: "# Still here" });
    const { result } = renderHook(() =>
      useAutosave({ noteId: 2, initialContent: "", save, delay: 80 }),
    );

    act(() => result.current.setContent("# Still here"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80);
    });
    expect(result.current.content).toBe("# Still here");
    expect(result.current.status).toBe("error");
    expect(result.current.error?.message).toBe("Backend is offline");

    await act(async () => {
      result.current.retry();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.content).toBe("# Still here");
    expect(result.current.status).toBe("saved");
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("warns before leaving as soon as an unsaved draft exists", () => {
    const save = vi.fn().mockResolvedValue({ content: "saved" });
    const { result } = renderHook(() =>
      useAutosave({ noteId: 3, initialContent: "saved", save, delay: 500 }),
    );
    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;

    act(() => result.current.setContent("unsaved draft"));
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it("restores a draft after the editor unmounts and saves it when reopened", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockRejectedValue(new Error("Backend is offline"));
    const options = { noteId: 8, initialContent: "", save, delay: 80 };
    const first = renderHook(() => useAutosave(options));
    act(() => first.result.current.setContent("# Recovered locally"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80);
    });
    first.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(window.localStorage.getItem("curz-note-draft:8")).toBe("# Recovered locally");

    save.mockResolvedValueOnce({ content: "# Recovered locally" });
    const reopened = renderHook(() => useAutosave(options));
    expect(reopened.result.current.content).toBe("# Recovered locally");
    expect(reopened.result.current.status).toBe("unsaved");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80);
    });
    expect(reopened.result.current.status).toBe("saved");
    expect(window.localStorage.getItem("curz-note-draft:8")).toBeNull();
  });

  it("migrates a saved draft from the old storage key", () => {
    window.localStorage.setItem("threadwise-note-draft:12", "# Kept from before");
    const save = vi.fn().mockResolvedValue({ content: "# Kept from before" });

    const { result } = renderHook(() =>
      useAutosave({ noteId: 12, initialContent: "", save }),
    );

    expect(result.current.content).toBe("# Kept from before");
    expect(window.localStorage.getItem("curz-note-draft:12")).toBe("# Kept from before");
    expect(window.localStorage.getItem("threadwise-note-draft:12")).toBeNull();
  });
});
