import { z } from "zod";

// OAuth provider registry. Each provider is a plain descriptor plus a
// `mapProfile` that normalizes the provider's userinfo response into the shape
// the auth router persists. Adding a second provider later is just another
// entry here — the router is provider-agnostic.

export interface NormalizedProfile {
  providerAccountId: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
}

export interface AuthProvider {
  id: string;
  displayName: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  // Optional: a provider with no creds configured is reported as disabled
  // rather than crashing the boot.
  clientId?: string;
  clientSecret?: string;
  mapProfile: (raw: unknown) => NormalizedProfile;
}

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

// Provider descriptors WITHOUT creds. Creds are read lazily (see
// enabledProviders) so a test can toggle them via stubEnv without re-importing.
const PROVIDER_DESCRIPTORS: Omit<AuthProvider, "clientId" | "clientSecret">[] = [
  {
    id: "google",
    displayName: "Google",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scopes: ["openid", "email", "profile"],
    mapProfile: mapGoogleProfile,
  },
];

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

// Resolve the configured creds for a provider id from LIVE env. Deliberately
// not the frozen `config` snapshot: enabledProviders must reflect creds set
// after module import (the route tests toggle creds in beforeEach, and a
// no-creds boot can have creds injected later). Centralized so adding a
// provider only needs one more case here.
function credsFor(providerId: string): { clientId?: string; clientSecret?: string } {
  switch (providerId) {
    case "google":
      return {
        clientId: readEnv("GOOGLE_CLIENT_ID"),
        clientSecret: readEnv("GOOGLE_CLIENT_SECRET"),
      };
    default:
      return {};
  }
}

// LAZY: reads creds at call time so a provider toggled on/off via env is
// reflected without re-importing. Only providers with BOTH a client id and
// secret are considered enabled.
export function enabledProviders(): AuthProvider[] {
  return PROVIDER_DESCRIPTORS.flatMap((descriptor) => {
    const creds = credsFor(descriptor.id);
    if (!creds.clientId || !creds.clientSecret) return [];
    return [{ ...descriptor, ...creds }];
  });
}

// Look up a single enabled provider by id (undefined if unknown OR disabled).
export function getProvider(id: string): AuthProvider | undefined {
  return enabledProviders().find((provider) => provider.id === id);
}
