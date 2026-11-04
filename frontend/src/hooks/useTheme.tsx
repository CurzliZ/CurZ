import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { APP_NAME } from "@/lib/brand";

export type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const themeStorageKey = `${APP_NAME.toLowerCase()}-theme`;
const legacyThemeStorageKey = "threadwise-theme";

function readTheme(): Theme {
  const current = window.localStorage.getItem(themeStorageKey);
  if (current === "light" || current === "dark") return current;
  const legacy = window.localStorage.getItem(legacyThemeStorageKey);
  if (legacy === "light" || legacy === "dark") {
    window.localStorage.setItem(themeStorageKey, legacy);
    window.localStorage.removeItem(legacyThemeStorageKey);
    return legacy;
  }
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme: () =>
        setTheme((current) => (current === "dark" ? "light" : "dark")),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return value;
}
