// buildResolveActionOp (epic #1827 Slice 5, #1832) — turns a completed
// ResolutionRolls payload (useResolution's commit callback, #1831) plus its
// driving TurnResolution descriptor into the wire-shaped ResolveActionOperation.
// The one cross-domain translation every adapter (weapon here, spell in
// #1833) needs: TurnResolutionCostKind spells "bonusAction" the way
// useTurnState/TurnResolution do, but ResolveActionEventCost (the persisted
// event / op shape, #1829) spells it "bonus" — #1831 review comment 1.

import type { ResolveActionOperation } from "@/api/client";
import type { ResolutionRolls } from "@/features/session/useResolution";
import type { ResolveActionEventCost, TurnResolution } from "@character-sheet/shared-types";

const COST_KIND: Record<TurnResolution["cost"]["kind"], ResolveActionEventCost["kind"]> = {
  action: "action",
  bonusAction: "bonus",
  reaction: "reaction",
};

export function buildResolveActionOp(
  resolution: TurnResolution,
  rolls: ResolutionRolls,
  slotLevel?: number,
): ResolveActionOperation {
  return {
    type: "resolveAction",
    actionId: rolls.actionId,
    source: resolution.source,
    cost: {
      kind: COST_KIND[resolution.cost.kind],
      ...(resolution.cost.attacks !== undefined ? { attacks: resolution.cost.attacks } : {}),
    },
    toHit: rolls.toHit,
    save: rolls.save,
    effect: rolls.effect,
    ...(slotLevel !== undefined ? { slotLevel } : {}),
  };
}
