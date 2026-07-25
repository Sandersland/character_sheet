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
 */
export function editionOf(row: { rulesEdition: RulesEdition }): RulesEdition {
  return row.rulesEdition;
}
