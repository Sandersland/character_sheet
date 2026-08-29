// Barrel re-export — the actual class data is seeded ClassFeature rows,
// resolved at read time by classes/registry.ts. See classes/types.ts for the
// shared shapes.
export type { DerivedClassInfo, DerivedResource } from "./types.js";
export {
  deriveEntryScopedResources,
  deriveEntryScopedResourcesForCharacterRow,
  deriveResources,
  deriveResourcesForCharacterRow,
  resolveClassDie,
  SHARED_POOL_MERGE,
} from "./registry.js";
