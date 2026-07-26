/**
 * Context boundary between PreferencesProvider (features/preferences — owns
 * the reconcile-on-login + mirror-to-localStorage logic, #1178) and the three
 * preference hooks that consume it (useThemePreference, useDiceRollStyle,
 * useAutoRollConcentrationPref). A true leaf module (React only) — deliberately
 * OWNS the UserPreferences/ThemePreference/DiceRollStyle type definitions
 * rather than importing them from types/auth.ts or the hook files, so nothing
 * that depends on it (including those same hook files) can cycle back.
 * useThemePreference.ts / useDiceRollStyle.ts re-export their type from here
 * for existing consumers; types/auth.ts imports UserPreferences from here too.
 */
import { createContext, useContext } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type DiceRollStyle = "animated" | "quick";

export interface UserPreferences {
  theme: ThemePreference;
  diceRollStyle: DiceRollStyle;
  autoRollConcentration: boolean;
}

export interface PreferencesContextValue {
  // undefined until the provider's reconcile effect has resolved at least
  // once (still pure localStorage until then, e.g. anonymous or still loading).
  synced: UserPreferences | undefined;
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/**
 * Outside a PreferencesProvider (isolated component/hook tests, or a stray
 * render before App's provider tree mounts) this degrades to pure
 * localStorage with no sync — `synced` stays undefined and `setPreference` is
 * a no-op, matching pre-#1178 behavior.
 */
export function usePreferencesSync(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  return ctx ?? { synced: undefined, setPreference: () => {} };
}
