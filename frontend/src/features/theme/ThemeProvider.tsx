/* eslint-disable react-refresh/only-export-components -- provider module co-exports its use* hook beside the component; same-file hook+provider is intentional, HMR-only caveat */
// A pre-paint inline script in index.html applies the same theme value before React mounts, to avoid a flash of the wrong theme.
import {
  createContext,
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

  useEffect(() => {
    const next = resolveTheme(preference);
    setResolved(next);
    document.documentElement.dataset.theme = next;
  }, [preference]);

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
