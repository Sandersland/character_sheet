/* eslint-disable react-refresh/only-export-components */
/**
 * App-wide theme context. Persists the player's light/dark/system preference
 * (via useThemePreference) and reflects the resolved theme onto
 * `document.documentElement.dataset.theme`, which drives the `[data-theme]`
 * overrides in index.css. A pre-paint inline script in index.html applies the
 * same value before React mounts to avoid a flash of the wrong theme.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  resolveTheme,
  useThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "@/hooks/useThemePreference";

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (value: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useThemePreference();
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(preference));

  // Reflect the resolved theme onto the document so the CSS overrides apply.
  useEffect(() => {
    const next = resolveTheme(preference);
    setResolved(next);
    document.documentElement.dataset.theme = next;
  }, [preference]);

  // While following the OS, re-resolve when the system scheme flips.
  useEffect(() => {
    if (preference !== "system") return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const next = resolveTheme("system");
      setResolved(next);
      document.documentElement.dataset.theme = next;
    };
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [preference]);

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
