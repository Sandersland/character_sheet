/**
 * Account-synced player preferences (#1178): reconciles the three cs:pref:*
 * localStorage values (theme, dice-roll style, auto-roll concentration) with
 * the server-side User.preferences column carried on GET /api/auth/me — no
 * extra round-trip. Sits inside AuthProvider (reads `user`/`status` via
 * useAuth) and above ThemeProvider/DiceRollStyleProvider in App.tsx, since
 * useThemePreference/useDiceRollStylePreference/useAutoRollConcentrationPref
 * all consume usePreferencesSync() rather than talking to the API directly.
 *
 * Reconciliation runs once per login (keyed on `user.id`):
 *  - `user.preferences === null` — the server has NEVER stored preferences for
 *    this account (a nullable marker, not "equals defaults"): push this
 *    browser's current local values up once, so first-login-after-upgrade
 *    preserves what the player already had rather than resetting to defaults.
 *  - `user.preferences` present — the server is authoritative: adopt it and
 *    mirror it into localStorage, even if local values differ (or are still
 *    untouched defaults) — a second device must not clobber real synced
 *    values with its own unset preferences.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

import { patchPreferences } from "@/api/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { loadThemePreference, saveThemePreference } from "@/hooks/useThemePreference";
import { loadDiceRollStyle, saveDiceRollStyle } from "@/hooks/useDiceRollStyle";
import {
  loadAutoRollConcentration,
  saveAutoRollConcentration,
} from "@/features/hitpoints/concentrationPreference";
import { PreferencesContext, type UserPreferences } from "@/hooks/usePreferencesSync";

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
      // Never stored server-side: this browser's local values are the only
      // real settings that exist for this account — push them up rather than
      // resetting to defaults on the server.
      const snapshot = localSnapshot();
      patchPreferences(snapshot)
        .then(setSynced)
        .catch(() => setSynced(snapshot));
      return;
    }

    // Server already has a stored value — it wins, even over a second
    // device's untouched local defaults.
    mirrorToLocalStorage(user.preferences);
    setSynced(user.preferences);
  }, [status, user]);

  function setPreference<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setSynced((prev) => {
      const next = { ...(prev ?? localSnapshot()), [key]: value };
      mirrorToLocalStorage(next);
      return next;
    });
    const patch = { [key]: value } as Partial<UserPreferences>;
    patchPreferences(patch).catch(() => {
      // Best-effort sync — the local write already landed above, so the
      // player's change isn't lost, just not yet reflected on other devices.
    });
  }

  return (
    <PreferencesContext.Provider value={{ synced, setPreference }}>
      {children}
    </PreferencesContext.Provider>
  );
}
