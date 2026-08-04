import type { RulesEdition } from "@character-sheet/shared-types";

// `@character-sheet/shared-types` is an ordinary workspace package (plain
// node resolution, not the `@/` tsconfig alias FeatCategory's mirror comment
// warns seed modules away from), so this aliases the real type instead of
// hand-duplicating it. `undefined`/omitted on a seed row means "shared" (NULL
// column, valid in both editions); only a genuinely diverging row sets this.
// Exception: CatalogSpell's `edition?` uses a per-file default instead
// (EDITION_2024 in spells.ts, EDITION_2014 in spells-2014/*) — see spells.ts's
// header and resolvedSpellEdition in seed.ts.
export type SeedEdition = RulesEdition;
