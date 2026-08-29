import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { patchPreferences } from "@/api/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { loadThemePreference, saveThemePreference } from "@/hooks/useThemePreference";
import { loadDiceRollStyle, saveDiceRollStyle } from "@/hooks/useDiceRollStyle";
import {
  loadAutoRollConcentration,
  saveAutoRollConcentration,
} from "@/features/hitpoints/concentrationPreference";
import {
  PreferencesContext,
  PREFERENCE_SYNC_ERROR,
  type PreferenceSyncState,
  type UserPreferences,
} from "@/hooks/usePreferencesSync";

// Mirrors backend DEFAULT_PREFERENCES — kept as a literal since this leaf has no import path to the backend schema.
const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  diceRollStyle: "animated",
  autoRollConcentration: true,
};

// Read/written only by the reconcile effect below — never by the pre-paint inline script, which reads cs:pref:theme synchronously with no notion of a user.
const OWNER_KEY = "cs:pref:owner";

function loadPreferencesOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function claimPreferencesOwner(userId: string): void {
  try {
    localStorage.setItem(OWNER_KEY, userId);
  } catch {
    // Storage full or private-browsing restriction — silently skip.
  }
}

function localSnapshot(): UserPreferences {
  return {
    theme: loadThemePreference(),
    diceRollStyle: loadDiceRollStyle(),
    autoRollConcentration: loadAutoRollConcentration(),
  };
}

function mirrorToLocalStorage(preferences: UserPreferences): void {
  saveThemePreference(preferences.theme);
  saveDiceRollStyle(preferences.diceRollStyle);
  saveAutoRollConcentration(preferences.autoRollConcentration);
}

function without<T extends string, V>(
  map: Partial<Record<T, V>>,
  key: T,
): Partial<Record<T, V>> {
  const rest = { ...map };
  delete rest[key];
  return rest;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const [synced, setSynced] = useState<UserPreferences | undefined>(undefined);
  const [sync, setSync] = useState<PreferenceSyncState>({ saving: {}, errors: {} });
  // Guards the once-per-login reconcile against re-renders while status/user settle (and StrictMode's dev double-invoke of effects).
  const reconciledForUserId = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    if (reconciledForUserId.current === user.id) return;
    reconciledForUserId.current = user.id;

    if (user.preferences === null) {
      const owner = loadPreferencesOwner();
      if (owner !== null && owner !== user.id) {
        // A different account's values are mirrored on this shared browser — adopt defaults instead of leaking them into this account.
        claimPreferencesOwner(user.id);
        setSynced(DEFAULT_PREFERENCES);
        return;
      }
      // No sync-error surface here — a failed migration fires with no user gesture on every cold start, not a condition worth an error banner.
      claimPreferencesOwner(user.id);
      const snapshot = localSnapshot();
      patchPreferences(snapshot)
        .then(setSynced)
        .catch(() => setSynced(snapshot));
      return;
    }

    // Server already has a stored value — it wins, even over a second device's untouched local defaults.
    claimPreferencesOwner(user.id);
    setSynced(user.preferences);
  }, [status, user]);

  // Mirroring lives in its own effect (not inside the setSynced updater above) — updaters must stay pure, and StrictMode double-invokes them in dev.
  useEffect(() => {
    if (synced !== undefined) mirrorToLocalStorage(synced);
  }, [synced]);

  const setPreference = useCallback(
    <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      setSynced((prev) => ({ ...(prev ?? localSnapshot()), [key]: value }));
      setSync((prev) => ({ saving: { ...prev.saving, [key]: true }, errors: without(prev.errors, key) }));
      // .then(onOk, onErr), not .then(...).catch(...) — the latter would also catch a throw from onOk and misreport a succeeded write as failed.
      patchPreferences({ [key]: value } as Partial<UserPreferences>).then(
        () => setSync((prev) => ({ saving: without(prev.saving, key), errors: without(prev.errors, key) })),
        () =>
          setSync((prev) => ({
            saving: without(prev.saving, key),
            // Safe against staleness: a newer setPreference for this key drops this entry via `without` before this failure branch could install a new one.
            errors: {
              ...prev.errors,
              [key]: { message: PREFERENCE_SYNC_ERROR, retry: () => setPreference(key, value) },
            },
          })),
      );
      // Not durable: once the account has any stored value, the next login's reconcile adopts the server's older one and reverts this optimistic write.
    },
    [],
  );

  // Memoized so an unrelated AuthProvider re-render doesn't cascade through every preference-consuming provider below it.
  const value = useMemo(() => ({ synced, setPreference, sync }), [synced, setPreference, sync]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
