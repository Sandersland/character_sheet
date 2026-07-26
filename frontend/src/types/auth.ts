// Account-synced player preferences (#1178), riding the /auth/me payload.
// Defined in usePreferencesSync (a dependency-free leaf) and re-exported here
// rather than duplicated, so this module can't cycle back into the hooks that
// also depend on it.
export type { UserPreferences } from "@/hooks/usePreferencesSync";
import type { UserPreferences } from "@/hooks/usePreferencesSync";

// The signed-in user as returned by GET /api/auth/me (`{ user }`). `preferences`
// is null when this account has never stored any (distinct from a stored
// object equal to the defaults) — see PreferencesProvider for the migration
// this distinction drives.
export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
  preferences: UserPreferences | null;
}

// One enabled sign-in provider from GET /api/auth/providers. `startUrl` is the
// absolute URL the login button links to (begins the OAuth redirect dance).
export interface AuthProviderInfo {
  id: string;
  displayName: string;
  startUrl: string;
}
