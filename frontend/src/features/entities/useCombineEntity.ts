import { useMutation, useQueryClient } from "@tanstack/react-query";

import { combineEntities } from "@/api/client";
import { invalidateCombineCaches } from "@/lib/combineCacheInvalidation";

// The single combine write (#1943), a 1-length loserEntityIds call onto
// #1942's now-batch endpoint: absorbs `duplicateId` into `survivorId` and
// deletes it. invalidateCombineCaches (shared with #1946's useCombineCluster
// — #1949) covers entities/merges/inbox/chronicle; the caller navigates to
// the survivor's own page after success, whose backlinks/connections/
// activity reads are plain per-entity effects that refetch on their own from
// the entityId change, not TanStack Query, so there is no further cache to
// invalidate for them.
export function useCombineEntity(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ duplicateId, survivorId }: { duplicateId: string; survivorId: string }) =>
      combineEntities(campaignId, survivorId, [duplicateId]),
    onSuccess: () => invalidateCombineCaches(queryClient, campaignId),
  });
}
