import { useMutation, useQueryClient } from "@tanstack/react-query";

import { combineEntities } from "@/api/client";
import { invalidateCombineCaches } from "@/lib/combineCacheInvalidation";

interface CombineClusterInput {
  campaignId: string;
  loserIds: string[];
  survivorId: string;
}

// invalidateCombineCaches is shared with useCombineEntity — both need it to cover the mention-token rewrite on Character.journal (#1943).
export function useCombineCluster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, loserIds, survivorId }: CombineClusterInput) =>
      combineEntities(campaignId, survivorId, loserIds),
    onSuccess: (_data, { campaignId }) => invalidateCombineCaches(queryClient, campaignId),
  });
}
