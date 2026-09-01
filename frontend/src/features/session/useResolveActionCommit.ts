import { applyResolveActionOperations } from "@/api/client";
import type { ResolveActionOperation } from "@/api/client";
import { buildResolveActionOp } from "@/lib/resolveActionOp";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { ResolutionRolls } from "@/features/session/useResolution";
import type { ResolveActionEventEffect, TurnResolution } from "@character-sheet/shared-types";

export function riderTotalsOf(effects: Record<string, ResolveActionEventEffect>): Record<string, number> {
  return Object.fromEntries(Object.entries(effects).map(([id, effect]) => [id, effect.total]));
}

// Riders are cast-level and rolled once regardless of instance count (#1983) — suppressed only when
// EVERY instance missed, mirroring the single-instance `toHit.verdict === "miss"` guard below. An
// instance with no toHit (auto-hit, Magic Missile) never counts as "missed".
export function allInstancesMissed(rolls: ResolutionRolls): boolean {
  const instances = rolls.instances;
  if (!instances || instances.length === 0) return false;
  return instances.every((instance) => instance.toHit?.verdict === "miss");
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
    const riders = rolls.toHit?.verdict === "miss" || allInstancesMissed(rolls) ? [] : Object.values(riderEffects);
    mutation
      .mutateAsync(buildResolveActionOp(resolution, rolls, { riders, assassinate }))
      .then((res) => onCommitted(res.batchId))
      .catch(() => {});
  }

  return { commit, pending: mutation.isPending, error: mutation.error };
}
