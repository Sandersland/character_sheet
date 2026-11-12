import type { AuthProvider, OAuthCredentials } from "./types.js";

import { config } from "@/lib/core/config.js";
import { PROVIDERS } from "@/lib/auth/oauth/providers/index.js";

// Reads creds from the config slice it is handed (the process config by default) so tests pass their own instead of mutating the frozen singleton.
export function enabledProviders(credentials: OAuthCredentials = config): AuthProvider[] {
  return PROVIDERS.flatMap((definition) => {
    const clientId = credentials[definition.clientIdEnv];
    const clientSecret = credentials[definition.clientSecretEnv];
    if (!clientId || !clientSecret) return [];
    // clientIdEnv/clientSecretEnv ride along harmlessly in the spread — they're config key NAMES, not secrets.
    return [{ ...definition, clientId, clientSecret }];
  });
}

export function getProvider(
  id: string,
  credentials: OAuthCredentials = config,
): AuthProvider | undefined {
  return enabledProviders(credentials).find((provider) => provider.id === id);
}
