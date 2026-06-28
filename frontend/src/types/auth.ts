// The signed-in user as returned by GET /api/auth/me (`{ user }`).
export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
}

// One enabled sign-in provider from GET /api/auth/providers. `startUrl` is the
// absolute URL the login button links to (begins the OAuth redirect dance).
export interface AuthProviderInfo {
  id: string;
  displayName: string;
  startUrl: string;
}
