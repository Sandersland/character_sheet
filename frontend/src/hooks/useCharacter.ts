import { skipToken, useQuery } from "@tanstack/react-query";

import { fetchCharacter } from "@/api/client";
import { characterKeys } from "@/api/queryKeys";

// No `setCharacter` here (#1284 C18 — the last consumer, useCurrentCharacter,
// now writes the cache itself): a page reads this hook directly only to
// render the load/error/not-found guard, never to mutate.
export function useCharacter(id: string | undefined) {
  const { data, isError } = useQuery({
    queryKey: characterKeys.detail(id),
    // skipToken (not `enabled`) keeps the no-id case type-safe: the query stays
    // pending, so `data` is undefined and consumers read it as "still loading" —
    // which is what the old effect's early return did.
    queryFn: id ? () => fetchCharacter(id) : skipToken,
  });

  // Tri-state, unchanged for consumers: undefined = in flight (or no id yet),
  // null = 404/403 (fetchCharacter resolves null, it does not throw), Character =
  // loaded. `error` means "nothing to show" — while stale data is on screen a
  // failed background refetch must not swap a working sheet for the error page.
  return { character: data, error: isError && data === undefined };
}
