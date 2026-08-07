/**
 * `@character-sheet/contracts` — route zod schemas shared across tiers (#1370,
 * epic #1369). Unlike `@character-sheet/shared-types` (pure types, no build,
 * `import type` from both tiers), this package's exports are VALUES: the
 * backend imports them as real zod schemas and calls `.parse()`; the frontend
 * imports only a derived type via `import type`, so zod itself never enters
 * the client bundle (scripts/check-no-zod-in-client-bundle.sh proves it).
 * That asymmetry is why this package builds to `dist/` (`tsc`) —
 * `node:22-alpine` cannot load a raw `.ts`, which is exactly what
 * `packages/shared-types`'s type-only contract lets it avoid.
 *
 * A zod schema here is a validation contract (which JSON shape an endpoint
 * accepts), not a 5e rule — the rule (DCs, dice, resource costs) stays in
 * backend `lib/classes/*.ts` and runs only on the server. See CLAUDE.md's
 * "Rules logic is backend-owned" note and this package's boundary zone in
 * `.fallowrc.jsonc`.
 *
 * **z.input policy (settled #1395, applies package-wide):** the frontend-
 * visible/client-send type of every schema here derives from
 * `z.input<typeof schema>`, never `z.infer`/`z.output`. `z.infer` aliases
 * `z.output`; the two diverge exactly where a schema has `.default()`,
 * `.transform()`, `.coerce`, or `.pipe()` — `z.input` is what the client is
 * actually allowed to send (a `.default()`ed field is optional; a
 * `.transform()`ed field is typed as its pre-transform value), while
 * `z.output` would force the client to construct a value the server is meant
 * to derive, contradicting this app's thin-client / derive-don't-persist
 * posture. `.refine()`-only schemas are unaffected (input === output). The
 * rule is uniform across the package; any per-schema deviation must carry a
 * why-comment. See `preferences-ops.ts` for the reference case (three
 * `.default()`s) and its `expectTypeOf` latch.
 */
export * from "./ability-ops.js";
export * from "./action-ops.js";
export * from "./campaign-ops.js";
export * from "./condition-ops.js";
export * from "./hp-ops.js";
export * from "./inventory-snapshot-capability.js";
export * from "./inventory-snapshot.js";
export * from "./item-vocabulary.js";
export * from "./journal-ops.js";
export * from "./preferences-ops.js";
export * from "./session-ops.js";
export * from "./spell-ops.js";
export * from "./xp-ops.js";
