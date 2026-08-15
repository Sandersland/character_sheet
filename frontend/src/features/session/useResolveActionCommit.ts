// useResolveActionCommit (#1845 fallow-flagged clone extraction) — the
// resolveAction mutation + "build the op, mutate, drop miss-dropped riders"
// commit step every useResolution-driving adapter needs (InlineAttackPicker
// #1832, the off-hand/Flurry bonus pickers #1845 via useBonusAttackSheet).
// Pulled out once a second, near-identical copy appeared rather than kept
// duplicated. `onCommitted` is the caller's own post-commit bookkeeping
// (advance completedSwings, clear local rider state) — this hook owns only
// the wire op + the mutation, never turnState.
//
// `onCommitted` is deferred to the mutation's SUCCESS (#1857, mirroring the
// spell-side `onCommitSlot` fix, #1833/#1848): a rejected resolveAction must
// not advance the local swing tally — the pre-fix code called `mutation.mutate`
// fire-and-forget and `onCommitted()` synchronously alongside it, so a server
// error still advanced the count with no way to retry short of a reload. The
// `.catch` here only stops the rejection from surfacing as an unhandled
// promise rejection; `error` (below) is what the caller renders.

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
  //
  // `assassinate` (#1526) is optional — only InlineAttackPicker's own
  // AssassinateSection ever sets it true; the off-hand/Flurry callers
  // (useBonusAttackSheet, #1845) omit it and get the same false/omitted wire
  // shape they always have.
  function commit(
    resolution: TurnResolution,
    rolls: ResolutionRolls,
    riderEffects: Record<string, ResolveActionEventEffect>,
    assassinate?: boolean,
  ) {
    const riders = rolls.toHit?.verdict === "miss" ? [] : Object.values(riderEffects);
    mutation
      .mutateAsync(buildResolveActionOp(resolution, rolls, { riders, assassinate }))
      .then(onCommitted)
      .catch(() => {});
  }

  return { commit, pending: mutation.isPending, error: mutation.error };
}
