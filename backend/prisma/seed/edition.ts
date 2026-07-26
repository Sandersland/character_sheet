import type { RulesEdition } from "@character-sheet/shared-types";

// `@character-sheet/shared-types` is an ordinary workspace package (plain
// node resolution, not the `@/` tsconfig alias FeatCategory's mirror comment
// warns seed modules away from), so this aliases the real type instead of
// hand-duplicating it. `undefined`/omitted on a seed row means "shared" (NULL
// column, valid in both editions); only a genuinely diverging row sets this.
export type SeedEdition = RulesEdition;
