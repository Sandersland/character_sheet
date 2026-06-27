import { z } from "zod";

import type { NormalizedProfile, ProviderDefinition } from "../types.js";

// Google's OIDC userinfo payload (the subset we use). `email_verified` gates
// whether we trust the address; unverified → we store null rather than risk
// account-takeover by an unverified-email collision.
const googleProfileSchema = z.object({
  sub: z.string().min(1),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
});

function mapGoogleProfile(raw: unknown): NormalizedProfile {
  const profile = googleProfileSchema.parse(raw);
  return {
    providerAccountId: profile.sub,
    email: profile.email_verified ? profile.email ?? null : null,
    name: profile.name ?? null,
    imageUrl: profile.picture ?? null,
  };
}

export const googleProvider: ProviderDefinition = {
  id: "google",
  displayName: "Google",
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
  scopes: ["openid", "email", "profile"],
  clientIdEnv: "GOOGLE_CLIENT_ID",
  clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  mapProfile: mapGoogleProfile,
  // Google-specific OAuth2 extensions: ask for a refresh token (offline) and
  // force the consent screen so the refresh token is actually returned.
  extraAuthParams: { access_type: "offline", prompt: "consent" },
};
