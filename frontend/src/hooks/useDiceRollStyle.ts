/**
 * localStorage persistence for the dice-roll presentation preference (#945). A
 * single global per-browser choice, shaped exactly like the theme preference
 * (useThemePreference): `animated` plays the 3D DiceRollModal, `quick` skips it
 * for a compact result chip. All access is try/catch-guarded so a missing or
 * corrupted entry degrades gracefully to the default.
 */

import { useCallback, useState } from "react";

export type DiceRollStyle = "animated" | "quick";

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

/** React hook over the preference: reads once on mount and persists on change. */
export function useDiceRollStylePreference(): [DiceRollStyle, (value: DiceRollStyle) => void] {
  const [value, setValue] = useState<DiceRollStyle>(loadDiceRollStyle);
  const set = useCallback((next: DiceRollStyle) => {
    setValue(next);
    saveDiceRollStyle(next);
  }, []);
  return [value, set];
}
