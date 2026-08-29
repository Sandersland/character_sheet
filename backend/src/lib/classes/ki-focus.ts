import type { RulesEdition } from "@character-sheet/shared-types";

import { abilityModifier } from "@/lib/srd/srd.js";

// SRD 5.1 Monk, Ki / PHB'14 p.78; SRD 5.2 Monk, Focus / PHB'24 p.88 — identical formula, no edition fork.
export function monkSaveDC(abilityScores: Record<string, number>, profBonus: number): number {
  return 8 + profBonus + abilityModifier(abilityScores.wisdom ?? 10);
}

// Ki Points (SRD 5.1 / PHB'14 p.78) vs Focus Points (SRD 5.2 / PHB'24 p.88).
export function monkPoolKey(edition: RulesEdition): "ki" | "focus" {
  switch (edition) {
    case "EDITION_2014":
      return "ki";
    case "EDITION_2024":
      return "focus";
    default: {
      const exhaustive: never = edition;
      throw new Error(`monkPoolKey: unhandled edition ${String(exhaustive)}`);
    }
  }
}
