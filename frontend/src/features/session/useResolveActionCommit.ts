import { applyResolveActionOperations } from "@/api/client";
import type { ResolveActionOperation } from "@/api/client";
import { buildResolveActionOp } from "@/lib/resolveActionOp";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { ResolutionRolls } from "@/features/session/useResolution";
import type { ResolveActionEventEffect, TurnResolution } from "@character-sheet/shared-types";

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
  onCommitted: (batchId: string) => void;
}) {
  const mutation = useCharacterMutation({
    characterId,
    mutationFn: (op: ResolveActionOperation) => applyResolveActionOperations(characterId, [op]),
    toCharacter: (result) => result.character,
    fallbackMessage: "Failed to resolve attack",
    onCharacterWritten: onLogChanged,
  });

  function commit(
    resolution: TurnResolution,
    rolls: ResolutionRolls,
    riderEffects: Record<string, ResolveActionEventEffect>,
    assassinate?: boolean,
  ) {
    const riders = rolls.toHit?.verdict === "miss" ? [] : Object.values(riderEffects);
    mutation
      .mutateAsync(buildResolveActionOp(resolution, rolls, { riders, assassinate }))
      .then((res) => onCommitted(res.batchId))
      .catch(() => {});
  }

  return { commit, pending: mutation.isPending, error: mutation.error };
}
