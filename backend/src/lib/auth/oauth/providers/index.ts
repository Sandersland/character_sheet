import type { ProviderDefinition } from "@/lib/auth/oauth/types.js";

import { googleProvider } from "./google.js";

// The provider manifest — the ONLY thing this file does is list the providers.
// To add one: create its module beside this file, import it here, and add it to
// the array. Resolution/enablement logic lives in ../registry.js, not here.
export const PROVIDERS: ProviderDefinition[] = [googleProvider];
