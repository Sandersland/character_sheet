import { skipToken, useQuery } from "@tanstack/react-query";

import { fetchReference } from "@/api/client";
import { referenceKeys } from "@/api/queryKeys";
import type { RulesEdition } from "@character-sheet/shared-types";

// staleTime: Infinity — catalog content (classes/races/items/spells) cannot
// change mid-session, so a remount should never refetch it. The edition is
// part of the queryKey (referenceKeys.byEdition), not a filter applied after
// the fact: /reference serves values already resolved per-edition (#1325), so
// two editions must never share a cache entry within staleTime: Infinity's
// permanently-fresh window.
export function useReferenceData(edition: RulesEdition | null | undefined) {
  const { data, isError } = useQuery({
    queryKey: referenceKeys.byEdition(edition),
    // skipToken (not `enabled`): a caller mid-resolving its own edition (e.g.
    // creation before CreationEntryGate settles rulesEdition) must not fetch
    // for a wrong/default edition — the query stays pending instead.
    queryFn: edition ? () => fetchReference(edition) : skipToken,
    staleTime: Infinity,
  });

  // `error` means "nothing to show" — a failed background refetch must not
  // discard catalog data already on screen.
  return { reference: data ?? null, error: isError && data === undefined };
}
