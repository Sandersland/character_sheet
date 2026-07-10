import type { AuthProvider } from "./types.js";

import { PROVIDERS } from "@/lib/auth/oauth/providers/index.js";

// Resolves the provider manifest (./providers) against env. Kept separate from
// the manifest so adding a provider only ever touches the array, not this logic.

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

// LAZY: reads creds from LIVE env at call time (not a frozen snapshot) so a
// provider toggled on/off via env is reflected without re-importing — the route
// tests rely on this, and a no-creds boot can have creds injected later. Only
// providers with BOTH a client id and secret configured are considered enabled.
export function enabledProviders(): AuthProvider[] {
  return PROVIDERS.flatMap((definition) => {
    const clientId = readEnv(definition.clientIdEnv);
    const clientSecret = readEnv(definition.clientSecretEnv);
    if (!clientId || !clientSecret) return [];
    // Spread the whole definition so every field — scopes, extraAuthParams, and
    // any future provider field — is forwarded automatically. (Manually listing
    // fields here previously dropped extraAuthParams.) The clientIdEnv/
    // clientSecretEnv names ride along harmlessly — they're env-var NAMES, not
    // secrets, and the resolved clientId/clientSecret below are what's used.
    return [{ ...definition, clientId, clientSecret }];
  });
}

// Look up a single enabled provider by id (undefined if unknown OR disabled).
export function getProvider(id: string): AuthProvider | undefined {
  return enabledProviders().find((provider) => provider.id === id);
}
