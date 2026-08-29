import { useMutation, useQueryClient } from "@tanstack/react-query";

import { combineEntities } from "@/api/client";
import { invalidateCombineCaches } from "@/lib/combineCacheInvalidation";

// Backlinks/connections/activity on the survivor's page are plain per-entity effects that refetch from the entityId change, not TanStack Query — no further cache to invalidate here.
export function useCombineEntity(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ duplicateId, survivorId }: { duplicateId: string; survivorId: string }) =>
      combineEntities(campaignId, survivorId, [duplicateId]),
    onSuccess: () => invalidateCombineCaches(queryClient, campaignId),
  });
}
