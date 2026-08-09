/**
 * The 5e bonus-action spellcasting interlock (#1439), resolved server-side from
 * a participant's per-turn cast record. This is the ONE shared rule function:
 * both the served flags (via getCombatState / the combat lifecycle responses)
 * and any future consumer read it here, never a second inline copy, and the
 * frontend receives its two resolved booleans rather than the cast kinds plus
 * this predicate.
 *
 * Edition-invariant: SRD 5.1 and SRD 5.2 state the rule identically ("if you
 * cast a spell with a bonus action, you can't cast another spell this turn
 * except a cantrip with a casting time of 1 action"), so it takes no `edition`
 * parameter — the cantrip carve-out and the leveled-both-ways block are the
 * same text in both.
 */

import type { SpellCastKind } from "@/generated/prisma/client.js";
import type { SpellEconomyState } from "@character-sheet/shared-types";

/**
 * Resolve the interlock from what the character cast in each economy slot this
 * turn. Only a *leveled* cast restricts — a cantrip in either slot leaves both
 * flags false (a cantrip is the very thing the rule still permits).
 */
export function spellEconomyRestrictions(
  spellCastAsAction: SpellCastKind | null,
  spellCastAsBonus: SpellCastKind | null,
): SpellEconomyState {
  return {
    bonusActionBlockedByActionSpell: spellCastAsAction === "leveled",
    actionLimitedToCantrips: spellCastAsBonus === "leveled",
  };
}
