// Public surface of @character-sheet/shared-types — the single source of truth
// for cross-tier (backend↔frontend) wire types that were previously hand-mirrored
// (#820). Pure types only: every consumer imports via `import type`, so nothing
// here reaches either runtime bundle. Add one file per mirror family and re-export
// it here.
export type * from "./action-result.js";
export type * from "./attack-row.js";
export type * from "./capabilities.js";
export type * from "./class-resources.js";
export type * from "./edition.js";
export type * from "./effects.js";
export type * from "./item-detail-inputs.js";
export type * from "./riders.js";
export type * from "./roll-event.js";
export type * from "./session.js";
export type * from "./spellcasting.js";
export type * from "./starting-equipment.js";
export type * from "./warrior-of-elements.js";
