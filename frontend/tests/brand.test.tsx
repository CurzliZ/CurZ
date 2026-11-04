// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeProvider, useTheme } from "../src/hooks/useTheme";

function ThemeValue() {
  const { theme } = useTheme();
  return <span>{theme}</span>;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("CurZ branding migration", () => {
  it("copies the old saved theme to the new key and stops using the old key", () => {
    window.localStorage.setItem("threadwise-theme", "light");

    const { container } = render(
      <ThemeProvider>
        <ThemeValue />
      </ThemeProvider>,
    );

    expect(container.textContent).toBe("light");
    expect(window.localStorage.getItem("curz-theme")).toBe("light");
    expect(window.localStorage.getItem("threadwise-theme")).toBeNull();
  });
});
