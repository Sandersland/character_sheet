// Shared contracts for the third-party OAuth method.
//
// Each provider lives in its own module under `providers/` and exports a single
// `ProviderDefinition`. The registry (`registry.ts`) resolves a definition's
// creds from env and hands the flow a fully-resolved `AuthProvider`.

export interface NormalizedProfile {
  providerAccountId: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
}

// A provider's static descriptor — everything except the resolved creds. This
// is the one thing each provider module exports, so adding a provider is "drop
// in a file + register it" with no shared-code changes. The provider names the
// env vars its creds come from; the registry reads them lazily.
export interface ProviderDefinition {
  id: string;
  displayName: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  mapProfile: (raw: unknown) => NormalizedProfile;
}

// A provider with its creds resolved from env — what the OAuth flow consumes.
// Creds are optional in the type for symmetry with the descriptor, but
// `enabledProviders()` only ever returns providers where both are present.
export type AuthProvider = Omit<
  ProviderDefinition,
  "clientIdEnv" | "clientSecretEnv"
> & {
  clientId?: string;
  clientSecret?: string;
};
