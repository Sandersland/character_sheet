/**
 * Account-synced player preferences (#1178): reconciles the three cs:pref:*
 * localStorage values with the server-side User.preferences column carried on
 * GET /api/auth/me — no extra round-trip. Sits inside AuthProvider and wraps
 * the theme/dice-roll/concentration providers, whose hooks all consume
 * usePreferencesSync() rather than talking to the API directly.
 *
 * Reconciliation runs once per login (keyed on `user.id`). `preferences ===
 * null` means the server has never stored anything for this account (a
 * nullable marker, not "equals defaults"): push this browser's local values up
 * — unless the `cs:pref:owner` marker names a DIFFERENT account (a shared
 * browser still mirroring a prior user), in which case adopt defaults instead
 * of leaking that user's settings into this one. Otherwise the server value is
 * authoritative and wins even over a second device's untouched local defaults.
 */
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

// Mirrors backend DEFAULT_PREFERENCES — kept as a literal since this leaf has
// no import path to the backend schema.
const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  diceRollStyle: "animated",
  autoRollConcentration: true,
};

// Which account's values are currently mirrored on this browser (#1178
// cross-account leak guard). Read/written only by the reconcile effect below
// — never by the pre-paint inline script, which must keep reading cs:pref:theme
// synchronously with no notion of a user.
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

// Drops one key from a Partial<Record<...>> map, used to clear a key's
// saving/error entry without mutating the previous state object.
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
  // Guards the once-per-login reconcile against re-renders while status/user
  // settle (and StrictMode's dev double-invoke of effects).
  const reconciledForUserId = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    if (reconciledForUserId.current === user.id) return;
    reconciledForUserId.current = user.id;

    if (user.preferences === null) {
      const owner = loadPreferencesOwner();
      if (owner !== null && owner !== user.id) {
        // A different account's values are mirrored on this shared browser —
        // don't push them into this one; adopt defaults and claim ownership
        // so this browser stops reading as the prior user's.
        claimPreferencesOwner(user.id);
        setSynced(DEFAULT_PREFERENCES);
        return;
      }
      // No marker (a genuine pre-upgrade browser) or this same account already
      // owns the mirrored values: push them up rather than resetting to
      // defaults on the server. No sync-error surface here (#1365) — this
      // fires with no user gesture on every cold start for an account that's
      // never stored preferences, and an offline cold start is not a user
      // condition worth an error banner for.
      claimPreferencesOwner(user.id);
      const snapshot = localSnapshot();
      patchPreferences(snapshot)
        .then(setSynced)
        .catch(() => setSynced(snapshot));
      return;
    }

    // Server already has a stored value — it wins, even over a second
    // device's untouched local defaults.
    claimPreferencesOwner(user.id);
    setSynced(user.preferences);
  }, [status, user]);

  // Mirroring lives in its own effect (not inside the setSynced updater above)
  // — updaters must stay pure, and StrictMode double-invokes them in dev.
  useEffect(() => {
    if (synced !== undefined) mirrorToLocalStorage(synced);
  }, [synced]);

  const setPreference = useCallback(
    <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      setSynced((prev) => ({ ...(prev ?? localSnapshot()), [key]: value }));
      setSync((prev) => ({ saving: { ...prev.saving, [key]: true }, errors: without(prev.errors, key) }));
      // .then(onOk, onErr), not .then(...).catch(...) — the latter would also
      // catch a throw from onOk and misreport a succeeded write as failed.
      patchPreferences({ [key]: value } as Partial<UserPreferences>).then(
        () => setSync((prev) => ({ saving: without(prev.saving, key), errors: without(prev.errors, key) })),
        () =>
          setSync((prev) => ({
            saving: without(prev.saving, key),
            // retry closes over this exact key/value and re-issues the same
            // write; safe against staleness because a NEWER setPreference for
            // this key drops this entry (the `without` above) before its own
            // failure branch could install a new one, so a fired retry always
            // matches what's currently shown.
            errors: {
              ...prev.errors,
              [key]: { message: PREFERENCE_SYNC_ERROR, retry: () => setPreference(key, value) },
            },
          })),
      );
      // The optimistic local write above keeps the change visible regardless
      // of outcome, and a failure is surfaced per-key via `sync` (#1365) — but
      // it is still not durable: once the account has any stored value, the
      // next login's reconcile adopts the server's older one and reverts
      // this. That revert is accepted; only the moment-of-failure is surfaced.
    },
    [],
  );

  // Memoized so an unrelated AuthProvider re-render (now outermost) doesn't
  // cascade through every preference-consuming provider below it.
  const value = useMemo(() => ({ synced, setPreference, sync }), [synced, setPreference, sync]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
