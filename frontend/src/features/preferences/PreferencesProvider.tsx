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
import { PreferencesContext, type UserPreferences } from "@/hooks/usePreferencesSync";

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

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const [synced, setSynced] = useState<UserPreferences | undefined>(undefined);
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
      // defaults on the server.
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
      patchPreferences({ [key]: value } as Partial<UserPreferences>).catch(() => {
        // Best-effort sync — the local write already landed above, so the
        // player's change isn't lost, just not yet reflected on other devices.
      });
    },
    [],
  );

  // Memoized so an unrelated AuthProvider re-render (now outermost) doesn't
  // cascade through every preference-consuming provider below it.
  const value = useMemo(() => ({ synced, setPreference }), [synced, setPreference]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
