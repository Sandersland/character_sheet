// The frontend receives these resolved booleans, never the cast kinds plus this predicate.
// SRD 5.1 / PHB'14 p.202 ("Casting a Spell" -> "Bonus Action"): "You can't cast another spell during the same turn, except for a cantrip with a casting time of 1 action."
// A bonus-action spell (cantrip or leveled) limits the Action to a cantrip; a leveled Action spell blocks the bonus action ENTIRELY -- a bonus cantrip is not the exception.
// SRD 5.2 / PHB'24 ("One Spell with a Spell Slot per Turn"): only one spell slot may be expended per turn, so a leveled spell in either economy limits the OTHER to cantrips (which cost no slot). Symmetric -- no economy is ever fully blocked.

import type { SpellCastKind } from "@/generated/prisma/client.js";
import type { RulesEdition } from "@/lib/rules/edition.js";
import type { SpellEconomyState } from "@character-sheet/shared-types";

export function spellEconomyRestrictions(
  spellCastAsAction: SpellCastKind | null,
  spellCastAsBonus: SpellCastKind | null,
  edition: RulesEdition,
): SpellEconomyState {
  const leveledAction = spellCastAsAction === "leveled";
  if (edition === "EDITION_2014") {
    return {
      bonusActionBlockedByActionSpell: leveledAction,
      bonusActionLimitedToCantrips: false,
      actionLimitedToCantrips: spellCastAsBonus != null,
    };
  }
  return {
    bonusActionBlockedByActionSpell: false,
    bonusActionLimitedToCantrips: leveledAction,
    actionLimitedToCantrips: spellCastAsBonus === "leveled",
  };
}
