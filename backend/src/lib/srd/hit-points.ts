import type { RulesEdition } from "@character-sheet/shared-types";

import { subclassActiveAt } from "@/lib/leveling/effective-levels.js";

// PHB'14 p.106 (Draconic Bloodline): +1 max HP per sorcerer level, active from L1. PHB'24 p.148 (Draconic Sorcery): +3 at L3, then +1 per level above that.
// Both resolve to the same number from L3 up, but that's a coincidence of the tables, not a reason to collapse into one expression — a future table correction to either edition must not silently corrupt the other (#1123).
export function draconicResilienceMaxHpBonus(
  sorcererLevel: number,
  subclassLevel: number | null | undefined,
  edition: RulesEdition,
): number {
  if (!subclassActiveAt(sorcererLevel, subclassLevel, edition)) return 0;
  switch (edition) {
    case "EDITION_2014":
      return sorcererLevel;
    case "EDITION_2024":
      // Kept as +3 then +1/level (not collapsed to `sorcererLevel`) so an
      // errata to either term edits exactly the number the book changes.
      return 3 + (sorcererLevel - 3);
    default: {
      const exhaustive: never = edition;
      throw new Error(`draconicResilienceMaxHpBonus: unhandled edition ${String(exhaustive)}`);
    }
  }
}
