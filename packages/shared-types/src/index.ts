// Public surface of @character-sheet/shared-types — the single source of truth
// for cross-tier (backend↔frontend) wire types that were previously hand-mirrored
// (#820). Pure types only: every consumer imports via `import type`, so nothing
// here reaches either runtime bundle. Add one file per mirror family and re-export
// it here.
export type * from "./spellcasting.js";
