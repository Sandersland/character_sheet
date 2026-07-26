import { useMutation, useQueryClient } from "@tanstack/react-query";

import { characterKeys } from "@/api/queryKeys";
import { errorMessage } from "@/lib/errorMessage";
import type { Character } from "@/types/character";

export interface UseCharacterMutationOptions<TVars, TResult> {
  characterId: string | undefined;
  mutationFn: (vars: TVars) => Promise<TResult>;
  /** Narrows the raw response to the Character to cache — required (no default):
   *  shape B/C responses carry extra keys (`results`, `batchId`) that must never
   *  land in the cached character (#1283 §1). */
  toCharacter: (result: TResult) => Character;
  fallbackMessage: string;
  /** Fires with the raw TResult after a successful write — a side-effect seam
   *  for a DIFFERENT resource than the character cache (e.g. useLevelUpCeremony's
   *  onSubmitted, which re-triggers the level-again flow). Never use this to
   *  write the character cache yourself — `onSuccess` already did that with
   *  `toCharacter`'s narrowed result; a raw `TResult` here still carries shape
   *  B/C's `results`/`batchId` keys and re-writing it re-pollutes the cache. */
  onCharacterWritten?: (result: TResult) => void;
}

export interface CharacterMutationResult<TVars, TResult> {
  mutate: (vars: TVars) => void;
  mutateAsync: (vars: TVars) => Promise<TResult>;
  isPending: boolean;
  error: string | null;
  reset: () => void;
}

/**
 * The shared write path for every character transaction endpoint (#1283):
 * fires `mutationFn`, writes the ONLY authoritative copy of the result into the
 * character query cache (no `invalidateQueries` — a refetch would race a
 * correct value backwards), and surfaces a friendly error via the existing
 * `errorMessage()` convention.
 *
 * `scope` serializes same-character mutations — without it, `useMutation`'s
 * default concurrent execution lets the last RESPONSE win instead of the last
 * REQUEST (spamming HP buttons could persist a stale character); see
 * useCharacterMutation.test.ts's out-of-order test.
 */
export function useCharacterMutation<TVars, TResult>({
  characterId,
  mutationFn,
  toCharacter,
  fallbackMessage,
  onCharacterWritten,
}: UseCharacterMutationOptions<TVars, TResult>): CharacterMutationResult<TVars, TResult> {
  const queryClient = useQueryClient();

  const mutation = useMutation<TResult, unknown, TVars>({
    scope: { id: `character-${characterId}` },
    mutationFn,
    onSuccess: (result) => {
      queryClient.setQueryData(characterKeys.detail(characterId), toCharacter(result));
      onCharacterWritten?.(result);
    },
  });

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error ? errorMessage(mutation.error, fallbackMessage) : null,
    reset: mutation.reset,
  };
}
