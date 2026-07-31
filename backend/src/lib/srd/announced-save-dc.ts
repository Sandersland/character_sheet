import type { RulesEdition } from "@character-sheet/shared-types";

import { saveDcAbilitiesFromRows, type ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";
import { abilityModifier } from "./math.js";

/**
 * A closed-form save DC a subclass announces from a row-declared ability
 * list (#1546): 8 + proficiency bonus + the higher of the named ability
 * modifiers (Battle Master maneuvers, PHB'14 p.73 / PHB'24 p.83 — both
 * editions word the DC identically, so this rule takes no `edition`
 * parameter). Genuinely generic, not a Fighter special case: Monk's focus
 * DC, Cleric's turn DC, Barbarian's frighten DC and Rogue's assassin DC are
 * the same closed form hardcoded into class TS strings today (see monk.ts's
 * monkSaveDC) — this is their shared home whenever each migrates. Mirrors
 * deriveAttacksPerAction's row-driven shape (extra-attack.ts) but reads
 * `saveDcAbilities`, not `derivedStatTiers`/`derivedStat`: the DC is
 * per-character ability math, not a level tier, and (per
 * saveDcAbilitiesFromRows' own comment) the row it lives on may already
 * spend its `derivedStat` slot on an unrelated tiered count.
 */
export function deriveAnnouncedSaveDC(
  rows: readonly ClassFeatureRow[],
  level: number,
  edition: RulesEdition,
  abilityScores: Record<string, number>,
  profBonus: number,
): number | undefined {
  const abilities = saveDcAbilitiesFromRows(rows, level, edition);
  if (!abilities) return undefined;
  const mods = abilities.map((ability) => abilityModifier(abilityScores[ability] ?? 10));
  return 8 + profBonus + Math.max(...mods);
}
