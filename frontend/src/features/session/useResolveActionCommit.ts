// useResolveActionCommit (#1845 fallow-flagged clone extraction) — the
// resolveAction mutation + "build the op, mutate, drop miss-dropped riders"
// commit step every useResolution-driving adapter needs (InlineAttackPicker
// #1832, the off-hand/Flurry bonus pickers #1845 via useBonusAttackSheet).
// Pulled out once a second, near-identical copy appeared rather than kept
// duplicated. `onCommitted` is the caller's own post-commit bookkeeping
// (advance completedSwings, clear local rider state) — this hook owns only
// the wire op + the mutation, never turnState.

import { applyResolveActionOperations } from "@/api/client";
import type { ResolveActionOperation } from "@/api/client";
import { buildResolveActionOp } from "@/lib/resolveActionOp";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { ResolutionRolls } from "@/features/session/useResolution";
import type { ResolveActionEventEffect, TurnResolution } from "@character-sheet/shared-types";

/** Display-only projection of a rolled-rider map onto DamageRiderList's own `riderTotals` prop. */
export function riderTotalsOf(effects: Record<string, ResolveActionEventEffect>): Record<string, number> {
  return Object.fromEntries(Object.entries(effects).map(([id, effect]) => [id, effect.total]));
}

export function useResolveActionCommit({
  characterId,
  onLogChanged,
  onCommitted,
}: {
  characterId: string;
  onLogChanged: () => void;
  /** Fires after the mutation is queued — the caller's own post-commit local-state advance. */
  onCommitted: () => void;
}) {
  const mutation = useCharacterMutation({
    characterId,
    mutationFn: (op: ResolveActionOperation) => applyResolveActionOperations(characterId, [op]),
    toCharacter: (c) => c,
    fallbackMessage: "Failed to resolve attack",
    onCharacterWritten: onLogChanged,
  });

  // Riders (#1843): a rider rolled before "it Missed" is called (the panel
  // stays visible until the verdict settles) is dropped rather than attached
  // to a miss's op, matching `effect: null` on a miss — a typed rider makes
  // no sense on a swing that didn't land.
  function commit(
    resolution: TurnResolution,
    rolls: ResolutionRolls,
    riderEffects: Record<string, ResolveActionEventEffect>,
  ) {
    const riders = rolls.toHit?.verdict === "miss" ? [] : Object.values(riderEffects);
    mutation.mutate(buildResolveActionOp(resolution, rolls, { riders }));
    onCommitted();
  }

  return { commit };
}
