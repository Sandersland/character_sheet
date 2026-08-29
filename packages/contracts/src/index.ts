/** Exports are zod VALUES for the backend to `.parse()`; the frontend imports only derived types (`import type`), so zod never enters the client bundle. */
/** Package-wide: derive every schema's client-facing type from `z.input`, never `z.infer`/`z.output` — they diverge on `.default()`/`.transform()`/`.coerce`/`.pipe()`, and `z.output` would force the client to construct server-derived values. */
export * from "./ability-ops.js";
export * from "./action-ops.js";
export * from "./campaign-ops.js";
export * from "./catalog-ops.js";
export * from "./condition-ops.js";
export * from "./hp-ops.js";
export * from "./inbox-ops.js";
export * from "./inventory-snapshot-capability.js";
export * from "./inventory-snapshot.js";
export * from "./item-vocabulary.js";
export * from "./journal-ops.js";
export * from "./preferences-ops.js";
export * from "./session-ops.js";
export * from "./spell-ops.js";
export * from "./xp-ops.js";
