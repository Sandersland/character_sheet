/**
 * The 5e bonus-action spellcasting interlock (#1439), resolved server-side from
 * a participant's per-turn cast record AND the character's edition. This is the
 * ONE shared rule function; the frontend receives its resolved booleans rather
 * than the cast kinds plus this predicate.
 *
 * The editions genuinely differ, so this takes `edition` as its last parameter
 * and stays one function (the `subclassGateLevel` pattern), resolved via
 * `editionOf(character)` — never a global:
 *
 * - SRD 5.1 / PHB'14 p.202 ("Casting a Spell" -> "Bonus Action"): "You can't cast
 *   another spell during the same turn, except for a cantrip with a casting time
 *   of 1 action." Casting a spell with a bonus action (cantrip OR leveled) thus
 *   limits the Action to a cantrip; and a leveled spell cast with the Action
 *   blocks the bonus action ENTIRELY -- a bonus cantrip is not the exception (the
 *   exception is a 1-action cantrip, i.e. cast with the Action).
 * - SRD 5.2 / PHB'24 ("One Spell with a Spell Slot per Turn"): you can expend
 *   only one spell slot on a turn, so casting a LEVELED spell in either economy
 *   limits the OTHER economy to cantrips (which cost no slot). Symmetric, and no
 *   economy is ever fully blocked -- a bonus cantrip stays castable after a
 *   leveled Action spell.
 */

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
      // ANY bonus-action spell (cantrip or leveled) limits the Action to a cantrip.
      actionLimitedToCantrips: spellCastAsBonus != null,
    };
  }
  return {
    bonusActionBlockedByActionSpell: false,
    // A leveled Action spell spent the turn's one slot -- leveled bonus spells
    // drop, bonus cantrips stay.
    bonusActionLimitedToCantrips: leveledAction,
    // Only a leveled bonus-action spell (which spent the slot) limits the Action.
    actionLimitedToCantrips: spellCastAsBonus === "leveled",
  };
}
