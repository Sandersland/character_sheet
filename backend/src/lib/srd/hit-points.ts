import type { RulesEdition } from "@character-sheet/shared-types";

import { subclassActiveAt } from "@/lib/leveling/effective-levels.js";

// Draconic Resilience max-HP term (Draconic Bloodline L1 2014 / Draconic
// Sorcery L3 2024, #1123) — forks because the RAW formula SHAPE differs
// between editions, not merely its running total. From L3 up the two
// resolve to the SAME number (both equal `sorcererLevel`) — see #1123's
// refinement comment — but that is a coincidence of the tables, not a
// reason to collapse this into one `subclassActiveAt(...) ? sorcererLevel :
// 0` expression: 2014 is a flat per-level rate from L1, 2024 is a flat +3
// grant at L3 followed by its own +1/level, and a future table correction to
// either edition must not silently corrupt the other.
//
// PHB'14 p.106 (Draconic Bloodline): "Your hit point maximum increases by 1
// per sorcerer level" — active the moment Sorcerous Origin is chosen (L1).
//
// PHB'24 p.148 (SRD 5.2 primary, Draconic Sorcery): "Your Hit Point maximum
// increases by 3, and it increases by 1 again whenever you gain a Sorcerer
// level" — granted alongside every 2024 subclass at L3, so nothing accrues
// below that gate.
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
      // Kept in RAW shape (+3 grant, then +1 per level above the L3 gate) per
      // the header — not collapsed to `sorcererLevel`, so an errata to either
      // term edits exactly the number the book changes.
      return 3 + (sorcererLevel - 3);
    default: {
      const exhaustive: never = edition;
      throw new Error(`draconicResilienceMaxHpBonus: unhandled edition ${String(exhaustive)}`);
    }
  }
}
