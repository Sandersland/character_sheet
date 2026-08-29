import type { AuthProvider } from "./types.js";

import { PROVIDERS } from "@/lib/auth/oauth/providers/index.js";

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

// Reads creds from LIVE env at call time (not a frozen snapshot) so a provider toggled on/off via env is reflected without re-importing — route tests rely on this.
export function enabledProviders(): AuthProvider[] {
  return PROVIDERS.flatMap((definition) => {
    const clientId = readEnv(definition.clientIdEnv);
    const clientSecret = readEnv(definition.clientSecretEnv);
    if (!clientId || !clientSecret) return [];
    // clientIdEnv/clientSecretEnv ride along harmlessly in the spread — they're env-var NAMES, not secrets.
    return [{ ...definition, clientId, clientSecret }];
  });
}

export function getProvider(id: string): AuthProvider | undefined {
  return enabledProviders().find((provider) => provider.id === id);
}
