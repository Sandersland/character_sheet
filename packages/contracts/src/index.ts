/**
 * `@character-sheet/contracts` — route zod schemas shared across tiers (#1370,
 * epic #1369). Unlike `@character-sheet/shared-types` (pure types, no build,
 * `import type` from both tiers), this package's exports are VALUES: the
 * backend imports them as real zod schemas and calls `.parse()`; the frontend
 * imports only the derived `z.infer` types via `import type`, so zod itself
 * never enters the client bundle (scripts/check-no-zod-in-client-bundle.sh
 * proves it). That asymmetry is why this package builds to `dist/` (`tsc`) —
 * `node:22-alpine` cannot load a raw `.ts`, which is exactly what
 * `packages/shared-types`'s type-only contract lets it avoid.
 *
 * A zod schema here is a validation contract (which JSON shape an endpoint
 * accepts), not a 5e rule — the rule (DCs, dice, resource costs) stays in
 * backend `lib/classes/*.ts` and runs only on the server. See CLAUDE.md's
 * "Rules logic is backend-owned" note and this package's boundary zone in
 * `.fallowrc.jsonc`.
 */
export * from "./ability-ops.js";
