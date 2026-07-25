import { useCallback } from "react";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchCharacter } from "@/api/client";
import { characterKeys } from "@/api/queryKeys";
import type { Character } from "@/types/character";

export function useCharacter(id: string | undefined) {
  const queryClient = useQueryClient();
  const { data, isError } = useQuery({
    queryKey: characterKeys.detail(id),
    // skipToken (not `enabled`) keeps the no-id case type-safe: the query stays
    // pending, so `data` is undefined and consumers read it as "still loading" —
    // which is what the old effect's early return did.
    queryFn: id ? () => fetchCharacter(id) : skipToken,
  });

  // The cache write that keeps the whole onUpdate chain working untouched until
  // #1284 retires it. Memoised because it is threaded as `onUpdate` into effect
  // deps deep in the sheet, where a new identity per render re-fires them.
  const setCharacter = useCallback(
    (next: Character) => {
      queryClient.setQueryData(characterKeys.detail(id), next);
    },
    [queryClient, id],
  );

  // Tri-state, unchanged for consumers: undefined = in flight (or no id yet),
  // null = 404/403 (fetchCharacter resolves null, it does not throw), Character =
  // loaded. `error` means "nothing to show" — while stale data is on screen a
  // failed background refetch must not swap a working sheet for the error page.
  return { character: data, error: isError && data === undefined, setCharacter };
}
