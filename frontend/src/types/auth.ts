// Re-exported from `usePreferencesSync` rather than duplicated, so this module can't cycle back into hooks that also depend on it.
export type { UserPreferences } from "@/hooks/usePreferencesSync";
import type { UserPreferences } from "@/hooks/usePreferencesSync";

/** `preferences` null (never stored) is distinct from a stored object equal to the defaults — `PreferencesProvider` reads this to drive migration. */
export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
  preferences: UserPreferences | null;
}

/** From GET /api/auth/providers; `startUrl` begins the OAuth redirect dance. */
export interface AuthProviderInfo {
  id: string;
  displayName: string;
  startUrl: string;
}
