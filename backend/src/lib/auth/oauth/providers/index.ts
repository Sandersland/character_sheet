import type { ProviderDefinition } from "@/lib/auth/oauth/types.js";

import { googleProvider } from "./google.js";

// To add a provider: create its module beside this file, import it here, and add it to the array. Resolution/enablement logic lives in registry.ts, not here.
export const PROVIDERS: ProviderDefinition[] = [googleProvider];
