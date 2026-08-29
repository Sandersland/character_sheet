import type { RulesEdition } from "@character-sheet/shared-types";

// `undefined`/omitted on a seed row means "shared" (NULL column, valid in both editions); only a diverging row sets this.
// Exception: CatalogSpell's `edition?` uses a per-file default (2024 vs 2014) instead, resolved via resolvedSpellEdition.
export type SeedEdition = RulesEdition;
