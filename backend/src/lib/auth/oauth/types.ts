export interface NormalizedProfile {
  providerAccountId: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
}

// The one thing each provider module exports, so adding a provider is "drop in a file + register it" with no shared-code changes.
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
  // Spread into the authorize URL so provider-agnostic flow code stays generic.
  extraAuthParams?: Record<string, string>;
}

// Creds are optional in the type for symmetry with ProviderDefinition, but enabledProviders() only ever returns providers where both are present.
export type AuthProvider = Omit<
  ProviderDefinition,
  "clientIdEnv" | "clientSecretEnv"
> & {
  clientId?: string;
  clientSecret?: string;
};
