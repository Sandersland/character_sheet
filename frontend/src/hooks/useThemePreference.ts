/**
 * localStorage persistence for the dark-mode theme preference. A single global
 * per-browser choice (not per-character), shaped like the concentration
 * preference (issue #76). All access is try/catch-guarded so a missing/corrupted
 * entry or a private-browsing restriction degrades gracefully to the default.
 *
 * `system` follows the OS `prefers-color-scheme`; `light`/`dark` pin a theme.
 */

import { useCallback, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "cs:pref:theme";

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function loadThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isThemePreference(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

export function saveThemePreference(value: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage full or private-browsing restriction — silently skip.
  }
}

export function getSystemTheme(): ResolvedTheme {
  try {
    if (typeof window === "undefined" || !window.matchMedia) return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? getSystemTheme() : preference;
}

/** React hook over the preference: reads once on mount and persists on change. */
export function useThemePreference(): [ThemePreference, (value: ThemePreference) => void] {
  const [value, setValue] = useState<ThemePreference>(loadThemePreference);
  const set = useCallback((next: ThemePreference) => {
    setValue(next);
    saveThemePreference(next);
  }, []);
  return [value, set];
}
