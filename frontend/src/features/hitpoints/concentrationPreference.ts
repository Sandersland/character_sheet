/**
 * localStorage persistence for the "auto-roll concentration saves" preference
 * (issue #76). A single global per-browser flag (not per-character).
 *
 * Default is `true` — preserves the issue #41 behavior (the server auto-rolls
 * the concentration CON save on damage) until the player opts into rolling it
 * themselves. All access is try/catch-guarded so a missing/corrupted entry or a
 * private-browsing restriction degrades gracefully to the default.
 */

import { useCallback, useState } from "react";

const STORAGE_KEY = "cs:pref:autoRollConcentration";

export function loadAutoRollConcentration(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

export function saveAutoRollConcentration(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
  } catch {
    // Storage full or private-browsing restriction — silently skip.
  }
}

/**
 * React hook over the preference: reads once on mount and persists on change.
 * Shaped like a `useState` pair so callers can drop it into a checkbox.
 */
export function useAutoRollConcentrationPref(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState<boolean>(loadAutoRollConcentration);
  const set = useCallback((next: boolean) => {
    setValue(next);
    saveAutoRollConcentration(next);
  }, []);
  return [value, set];
}
