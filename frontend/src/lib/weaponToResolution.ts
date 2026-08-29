// Builds TurnResolution from an already-served AttackEntry — every number is
// copied verbatim, never re-derived (CLAUDE.md: rules logic is backend-owned);
// toHit/effect components let the Session Log drill-in show a labeled
// breakdown instead of a flat total (#1830).

import type { AttackEntry } from "@/lib/attackMath";
import type { TurnResolution, TurnResolutionCostKind } from "@character-sheet/shared-types";

// attacks is carried on cost.attacks for the picker's own multi-swing loop
// (useResolution doesn't branch on it); costKind defaults to "action" but
// off-hand/Flurry single-swing bonus pickers (#1845) pass "bonusAction" to
// reuse this same builder.
export function weaponToResolution(
  entry: AttackEntry,
  critRange: number,
  attacks: number,
  costKind: TurnResolutionCostKind = "action",
): TurnResolution {
  return {
    source: entry.name,
    cost: { kind: costKind, attacks },
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
