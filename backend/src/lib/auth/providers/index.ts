// OAuth provider registry.
//
// Register a provider by adding its definition to PROVIDER_DEFINITIONS below —
// that is the ONLY line that changes when a new provider is added. Each
// provider's descriptor, profile schema, and `mapProfile` live in its own
// module (e.g. `./google.ts`), so this file stays provider-agnostic.

import { googleProvider } from "./google.js";
import type { AuthProvider, ProviderDefinition } from "./types.js";

export type {
  AuthProvider,
  NormalizedProfile,
  ProviderDefinition,
} from "./types.js";

const PROVIDER_DEFINITIONS: ProviderDefinition[] = [googleProvider];

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

// LAZY: reads creds from LIVE env at call time (not a frozen snapshot) so a
// provider toggled on/off via env is reflected without re-importing — the route
// tests rely on this, and a no-creds boot can have creds injected later. Only
// providers with BOTH a client id and secret configured are considered enabled.
export function enabledProviders(): AuthProvider[] {
  return PROVIDER_DEFINITIONS.flatMap((definition) => {
    const clientId = readEnv(definition.clientIdEnv);
    const clientSecret = readEnv(definition.clientSecretEnv);
    if (!clientId || !clientSecret) return [];
    return [
      {
        id: definition.id,
        displayName: definition.displayName,
        authUrl: definition.authUrl,
        tokenUrl: definition.tokenUrl,
        userInfoUrl: definition.userInfoUrl,
        scopes: definition.scopes,
        mapProfile: definition.mapProfile,
        clientId,
        clientSecret,
      },
    ];
  });
}

// Look up a single enabled provider by id (undefined if unknown OR disabled).
export function getProvider(id: string): AuthProvider | undefined {
  return enabledProviders().find((provider) => provider.id === id);
}
