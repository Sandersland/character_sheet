import { useQuery } from "@tanstack/react-query";

import { fetchReference } from "@/api/client";
import { referenceKeys } from "@/api/queryKeys";

// staleTime: Infinity — catalog content (classes/races/items/spells) cannot
// change mid-session, so a remount should never refetch it.
export function useReferenceData() {
  const { data, isError } = useQuery({
    queryKey: referenceKeys.all,
    queryFn: fetchReference,
    staleTime: Infinity,
  });

  // `error` means "nothing to show" — a failed background refetch must not
  // discard catalog data already on screen. See useCharacter for the same guard.
  return { reference: data ?? null, error: isError && data === undefined };
}
