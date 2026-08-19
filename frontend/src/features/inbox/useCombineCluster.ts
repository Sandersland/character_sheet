import { useMutation, useQueryClient } from "@tanstack/react-query";

import { combineEntities } from "@/api/client";
import { invalidateCombineCaches } from "@/lib/combineCacheInvalidation";

interface CombineClusterInput {
  campaignId: string;
  loserIds: string[];
  survivorId: string;
}

// The Review-duplicates modal's commit (#1946): one atomic #1942 call
// absorbing every loser into the survivor at once. All-or-nothing server-
// side (cross-loser guards run up front, inside one transaction) — a
// rejection leaves every entity untouched, so there is no partial-landing
// state to track here; the caller just re-shows the error and lets the DM
// retry the same combine. invalidateCombineCaches (shared with #1943's
// useCombineEntity — #1949) covers why each cache goes stale, including the
// chronicle rewrite.
export function useCombineCluster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, loserIds, survivorId }: CombineClusterInput) =>
      combineEntities(campaignId, survivorId, loserIds),
    onSuccess: (_data, { campaignId }) => invalidateCombineCaches(queryClient, campaignId),
  });
}
