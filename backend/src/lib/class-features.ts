// Barrel re-export — the actual class data lives one-file-per-class in
// classes/<class>.ts, flattened by classes/registry.ts. See classes/types.ts
// for the shared shapes.
export type { DerivedClassInfo } from "./classes/types.js";
export { deriveResources, deriveResourcesForCharacterRow, resolveClassDie } from "./classes/registry.js";
