// Context boundary between PreferencesProvider (owns the reconcile-on-login
// + mirror-to-localStorage logic) and the three preference hooks that
// consume it. A dependency-free leaf — owns the UserPreferences/
// ThemePreference/DiceRollStyle types itself so nothing that depends on it
// can cycle back; the hooks and AuthUser re-export those types from here.
import { createContext, useContext } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type DiceRollStyle = "animated" | "quick";

export interface UserPreferences {
  theme: ThemePreference;
  diceRollStyle: DiceRollStyle;
  autoRollConcentration: boolean;
}

export type PreferenceKey = keyof UserPreferences;

// #1365: per-key, not a shared flag — the sheet and the AccountMenu quick
// controls can each be mid-write on a different key at the same moment, and a
// shared boolean/error would mis-attribute one key's outcome to another.
// Each error carries its own retry closure (re-issuing that exact key/value)
// rather than a bare message, so a failed write can be resolved from the note
// itself instead of only by touching the control again.
export interface PreferenceSyncState {
  saving: Partial<Record<PreferenceKey, true>>;
  errors: Partial<Record<PreferenceKey, { message: string; retry: () => void }>>;
}

// Fixed string, not errorMessage(err) — the only realistic rejections are a
// bare network TypeError ("Failed to fetch") or preferencesRouter's generic
// "Invalid request body", neither of which is a message a player should read.
export const PREFERENCE_SYNC_ERROR =
  "Not saved to your account — this change stays on this device.";

export interface PreferencesContextValue {
  // undefined until the provider's reconcile effect has resolved at least
  // once (still pure localStorage until then, e.g. anonymous or still loading).
  synced: UserPreferences | undefined;
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  sync: PreferenceSyncState;
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null);

// Hoisted so every provider-less consumer shares one identity — an inline
// literal here would hand each of the three preference hooks a fresh
// `setPreference` reference every render, invalidating their own useCallback.
const NO_SYNC: PreferencesContextValue = {
  synced: undefined,
  setPreference: () => {},
  sync: { saving: {}, errors: {} },
};

// Outside a PreferencesProvider (isolated component/hook tests, or a stray
// render before App's provider tree mounts) this degrades to pure
// localStorage with no sync — `synced` stays undefined, `setPreference` is a
// no-op that can never fail, and `sync` reports every key idle.
export function usePreferencesSync(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  return ctx ?? NO_SYNC;
}

export function usePreferenceSync(
  key: PreferenceKey,
): { saving: boolean; error: string | null; retry: (() => void) | null } {
  const { sync } = usePreferencesSync();
  const entry = sync.errors[key];
  return { saving: sync.saving[key] === true, error: entry?.message ?? null, retry: entry?.retry ?? null };
}
