/**
 * localStorage persistence for the dice-roll presentation preference (#945). A
 * single global per-browser choice, shaped exactly like the theme preference
 * (useThemePreference): `animated` plays the 3D DiceRollModal, `quick` skips it
 * for a compact result chip. All access is try/catch-guarded so a missing or
 * corrupted entry degrades gracefully to the default.
 */

import { useCallback, useEffect, useState } from "react";

import { usePreferencesSync, type DiceRollStyle } from "@/hooks/usePreferencesSync";

// Re-exported (not defined here) so usePreferencesSync.ts stays the single
// owner of the type — see that file's banner for why (avoids a hooks/types
// import cycle now that dice-roll style is account-synced, #1178).
export type { DiceRollStyle };

const STORAGE_KEY = "cs:pref:diceRoll";

function isDiceRollStyle(value: unknown): value is DiceRollStyle {
  return value === "animated" || value === "quick";
}

export function loadDiceRollStyle(): DiceRollStyle {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isDiceRollStyle(raw) ? raw : "animated";
  } catch {
    return "animated";
  }
}

export function saveDiceRollStyle(value: DiceRollStyle): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage full or private-browsing restriction — silently skip.
  }
}

/**
 * React hook over the preference: paints from localStorage first, then adopts
 * the account-synced value once PreferencesProvider resolves one (#1178) —
 * which wins over a differing local value and gets mirrored back into
 * localStorage for the next cold start.
 */
export function useDiceRollStylePreference(): [DiceRollStyle, (value: DiceRollStyle) => void] {
  const { synced, setPreference } = usePreferencesSync();
  const [value, setValue] = useState<DiceRollStyle>(loadDiceRollStyle);

  useEffect(() => {
    if (synced === undefined) return;
    setValue(synced.diceRollStyle);
  }, [synced]);

  const set = useCallback(
    (next: DiceRollStyle) => {
      setValue(next);
      saveDiceRollStyle(next);
      setPreference("diceRollStyle", next);
    },
    [setPreference],
  );
  return [value, set];
}
