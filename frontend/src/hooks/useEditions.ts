import { useQuery } from "@tanstack/react-query";

import { fetchEditions } from "@/api/client";
import { catalogKeys } from "@/api/queryKeys";
import type { EditionsResponse } from "@/types/character";

interface UseEditionsResult {
  /**
   * The whole payload, or null until it resolves — deliberately ONE nullable
   * object rather than two nullable fields (#1436). Narrowing `editions !== null`
   * then proves `defaultEdition` is present too, which is what lets a caller
   * render its picker without a non-null assertion and without inventing a
   * fallback edition. The value these callers write is irreversible, so a
   * fallback would be a silent guess.
   */
  editions: EditionsResponse | null;
  /** Nothing to show: the fetch failed and no cached payload exists. */
  error: boolean;
  /** Re-runs the query — the "Try again" affordance on a failed first paint. */
  refetch: () => void;
}

// staleTime: Infinity, like useReferenceData — this is catalog content that
// cannot change mid-session, and a permanently-fresh entry means a test that
// seeds the cache never fires a request at all.
//
// No edition argument, by construction: the query key is edition-free
// because this is the endpoint a caller reads in order to CHOOSE an edition.
export function useEditions(): UseEditionsResult {
  const { data, isError, refetch } = useQuery({
    queryKey: catalogKeys.editions(),
    queryFn: fetchEditions,
    staleTime: Infinity,
  });

  // `error` means "nothing to show" — a failed background refetch must not
  // discard a payload already on screen.
  return { editions: data ?? null, error: isError && data === undefined, refetch: () => void refetch() };
}
