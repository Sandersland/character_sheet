export type { RulesEdition } from "@character-sheet/shared-types";

import type { RulesEdition } from "@character-sheet/shared-types";

/**
 * The one documented way for rules code to learn a character's edition (#1285).
 *
 * The authority is always the *character's* `rulesEdition`, never the
 * campaign's — a campaign's edition is only the default a new character is
 * created with, and a character may be in several campaigns or none (#1080).
 *
 * The parameter is required rather than optional on purpose: a Prisma `select`
 * that forgot `rulesEdition: true` is then a compile error instead of a silent
 * 2024 default.
 *
 * A rule that differs by edition takes `edition` as its **last** parameter and
 * stays one function per rule (branching inside, or dispatching to per-edition
 * helpers) — `subclassGateLevel` is the pattern-setter. A reconciler and its
 * clamp-on-read must always resolve to the same one. A rule that is
 * edition-invariant — the majority — takes no `edition` and changes nothing.
 *
 * Pure, zero-project-import modules (`effectiveEntryLevel`, `subclassGateLevel`)
 * import `RulesEdition` straight from `@character-sheet/shared-types` to stay
 * cycle-safe; everything else goes through `editionOf` here.
 */
export function editionOf(row: { rulesEdition: RulesEdition }): RulesEdition {
  return row.rulesEdition;
}

// Mirrors Character.rulesEdition's Prisma `@default(EDITION_2024)` — the ONE
// place validation code names that default explicitly, for the rare case where
// a decision (e.g. character-create.ts's creation-time subclass gate check)
// must resolve an edition before the row exists to read `rulesEdition` from.
// Deliberate-coupling latch: change the schema default, change this too.
export const DEFAULT_RULES_EDITION: RulesEdition = "EDITION_2024";

// Plain-language labels for user-facing text (e.g. the campaign-join mismatch
// error, #1286) — players say "2014/2024 rules", never "SRD 5.1/5.2".
export const RULES_EDITION_LABELS: Record<RulesEdition, string> = {
  EDITION_2014: "2014 rules",
  EDITION_2024: "2024 rules",
};
