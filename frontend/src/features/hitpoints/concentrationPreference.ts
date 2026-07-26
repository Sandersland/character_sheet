/**
 * The "auto-roll concentration saves" preference (issue #76). Account-synced
 * through PreferencesProvider (#1178) with localStorage as the first-paint
 * cache; a single flag for the player, not per-character.
 *
 * Default is `true` — preserves the issue #41 behavior (the server auto-rolls
 * the concentration CON save on damage) until the player opts into rolling it
 * themselves. All localStorage access is try/catch-guarded so a missing/corrupted
 * entry or a private-browsing restriction degrades gracefully to the default.
 */

import { useCallback, useEffect, useState } from "react";

import { usePreferencesSync } from "@/hooks/usePreferencesSync";

const STORAGE_KEY = "cs:pref:autoRollConcentration";

export function loadAutoRollConcentration(): boolean {
  try {
    // Default on: only an explicit "false" disables it, so a missing or
    // corrupted value falls back to auto-roll.
    return localStorage.getItem(STORAGE_KEY) !== "false";
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
 * React hook over the preference: paints from localStorage first, then adopts
 * the account-synced value once PreferencesProvider resolves one (#1178) —
 * which wins over a differing local value and gets mirrored back into
 * localStorage for the next cold start. Shaped like a `useState` pair so
 * callers can drop it into a checkbox.
 */
export function useAutoRollConcentrationPref(): [boolean, (value: boolean) => void] {
  const { synced, setPreference } = usePreferencesSync();
  const [value, setValue] = useState<boolean>(loadAutoRollConcentration);

  useEffect(() => {
    if (synced === undefined) return;
    setValue(synced.autoRollConcentration);
  }, [synced]);

  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      saveAutoRollConcentration(next);
      setPreference("autoRollConcentration", next);
    },
    [setPreference],
  );
  return [value, set];
}
