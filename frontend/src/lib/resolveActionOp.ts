// TurnResolutionCostKind spells it "bonusAction" (useTurnState/TurnResolution); ResolveActionEventCost spells it "bonus" — see COST_KIND below.
// `riders` is not threaded through TurnResolution/useResolution — it's read off the armed weapon's own `AttackEntry.damageRiders`, rolled by its own UI list outside the rail's step machinery, and passed in here at commit time alongside `slotLevel`.

import type { ResolveActionOperation } from "@/api/client";
import type { ResolutionRolls } from "@/features/session/useResolution";
import type { ResolveActionEventCost, ResolveActionEventEffect, TurnResolution } from "@character-sheet/shared-types";

const COST_KIND: Record<TurnResolution["cost"]["kind"], ResolveActionEventCost["kind"]> = {
  action: "action",
  bonusAction: "bonus",
  reaction: "reaction",
};

export interface BuildResolveActionOpOptions {
  slotLevel?: number;
  /** Omitted from the wire op entirely when empty. */
  riders?: ResolveActionEventEffect[];
  /** Present only for a spell resolution — a weapon swing omits it. See ResolveActionEventData (shared-types) for what its presence triggers server-side. */
  entryId?: string;
  /** Self/ally heal apply — see ResolveActionEventData (shared-types). */
  apply?: { target: "self" | { characterId: string }; kind: "heal" | "damage"; amount: number };
  /** 2014 Assassinate — only ever true; omitted (not sent as `false`) for every other swing, like `riders`/`slotLevel`. */
  assassinate?: boolean;
}

export function buildResolveActionOp(
  resolution: TurnResolution,
  rolls: ResolutionRolls,
  options: BuildResolveActionOpOptions = {},
): ResolveActionOperation {
  const { slotLevel, riders, entryId, apply, assassinate } = options;
  return {
    type: "resolveAction",
    actionId: rolls.actionId,
    source: resolution.source,
    cost: {
      kind: COST_KIND[resolution.cost.kind],
      ...(resolution.cost.attacks !== undefined ? { attacks: resolution.cost.attacks } : {}),
    },
    // toHit/effect stay null (never omitted) for an instanced resolution — the op schema's
    // superRefine only rejects a NON-null toHit/effect alongside instances, so sending the null
    // pair through unconditionally here is fine (#1983).
    toHit: rolls.toHit,
    save: rolls.save,
    effect: rolls.effect,
    ...(rolls.instances && rolls.instances.length > 0 ? { instances: rolls.instances } : {}),
    ...(riders && riders.length > 0 ? { riders } : {}),
    ...(slotLevel !== undefined ? { slotLevel } : {}),
    ...(entryId !== undefined ? { entryId } : {}),
    ...(apply !== undefined ? { apply } : {}),
    ...(assassinate ? { assassinate: true } : {}),
  };
}
