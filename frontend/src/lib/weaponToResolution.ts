// weaponToResolution (epic #1827 Slice 5, #1832) — the weapon half of the
// shared TurnResolution descriptor (#1828): builds it from an already-served
// AttackEntry (attackMath.ts, itself decorated straight off the character's
// served attackRows) plus the character's own critRange. No rule
// re-derivation (CLAUDE.md: rules logic is backend-owned) — every number and
// decomposed component breakdown is copied verbatim off the weapon row the
// serializer already computed, the same values useAttackRolls has always
// rolled against. Populating `toHit.components`/`effect.components` here is
// what lets the Session Log drill-in show the labeled `−1 (Strength) +2
// (Proficiency)` breakdown for a resolveAction event instead of a flat total
// (#1830 review).

import type { AttackEntry } from "@/lib/attackMath";
import type { TurnResolution } from "@character-sheet/shared-types";

/**
 * @param entry the armed weapon/unarmed/improvised form (buildAttackForms).
 * @param critRange the character's served crit threshold (Champion, #1120).
 * @param attacks Extra Attack count (`Character.attacksPerAction`) — carried
 *   on `cost.attacks` for the picker's own multi-swing loop to read; useResolution
 *   itself never branches on it (the loop lives in the driving component).
 */
export function weaponToResolution(entry: AttackEntry, critRange: number, attacks: number): TurnResolution {
  return {
    source: entry.name,
    cost: { kind: "action", attacks },
    toHit: {
      bonus: entry.attackSpec.modifier,
      critRange,
      ...(entry.attackComponents ? { components: entry.attackComponents } : {}),
    },
    effect: {
      spec: entry.damageSpec,
      kind: "damage",
      damageType: entry.damageType,
      ...(entry.damageComponents ? { components: entry.damageComponents } : {}),
    },
  };
}
