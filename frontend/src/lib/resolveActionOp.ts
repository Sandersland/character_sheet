// buildResolveActionOp (epic #1827 Slice 5, #1832; riders #1843) — turns a
// completed ResolutionRolls payload (useResolution's commit callback, #1831)
// plus its driving TurnResolution descriptor into the wire-shaped
// ResolveActionOperation. The one cross-domain translation every adapter
// (weapon here, spell in #1833) needs: TurnResolutionCostKind spells
// "bonusAction" the way useTurnState/TurnResolution do, but
// ResolveActionEventCost (the persisted event / op shape, #1829) spells it
// "bonus" — #1831 review comment 1.
//
// `riders` (#1843) is NOT threaded through TurnResolution/useResolution: a
// dice-valued on-hit rider (Flame Tongue +2d6 fire) is read off the armed
// weapon's OWN `AttackEntry.damageRiders` (attackMath.ts), rolled by its own
// UI list (DamageRiderList) outside the rail's step machinery — useResolution
// drives none of that today, so extending its step model to roll riders too
// would be scope creep this slice doesn't need. The adapter (InlineAttackPicker,
// #1832/#1843) accumulates each rolled rider into its own local state and
// passes the finished array in here at commit time, alongside `slotLevel`.

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
  /** Typed damage riders (#1843) — omitted from the wire op entirely when empty. */
  riders?: ResolveActionEventEffect[];
  /**
   * The character's own spellcasting entry id (#1833) — present only for a
   * spell resolution; a weapon swing omits it. See ResolveActionEventData's
   * own comment (shared-types) for what its presence triggers server-side.
   */
  entryId?: string;
  /** Self/ally heal apply (#1833/#462) — see ResolveActionEventData's own comment. */
  apply?: { target: "self" | { characterId: string }; kind: "heal" | "damage"; amount: number };
}

export function buildResolveActionOp(
  resolution: TurnResolution,
  rolls: ResolutionRolls,
  options: BuildResolveActionOpOptions = {},
): ResolveActionOperation {
  const { slotLevel, riders, entryId, apply } = options;
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
    ...(riders && riders.length > 0 ? { riders } : {}),
    ...(slotLevel !== undefined ? { slotLevel } : {}),
    ...(entryId !== undefined ? { entryId } : {}),
    ...(apply !== undefined ? { apply } : {}),
  };
}
