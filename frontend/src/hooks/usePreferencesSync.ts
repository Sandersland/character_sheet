/**
 * Context boundary between PreferencesProvider (owns the reconcile-on-login +
 * mirror-to-localStorage logic, #1178) and the three preference hooks that
 * consume it. A dependency-free leaf — owns the UserPreferences/
 * ThemePreference/DiceRollStyle types itself so nothing that depends on it can
 * cycle back; the hooks and AuthUser re-export those types from here.
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
