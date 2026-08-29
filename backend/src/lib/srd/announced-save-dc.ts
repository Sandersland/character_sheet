import type { RulesEdition } from "@character-sheet/shared-types";

import { saveDcAbilitiesFromRows, type ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";
import { abilityModifier } from "./math.js";

// Battle Master maneuver DC = 8 + proficiency bonus + highest named ability modifier, identical in both editions (PHB'14 p.73 / PHB'24 p.83).
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
