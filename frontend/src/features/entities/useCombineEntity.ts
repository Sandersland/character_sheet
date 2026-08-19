import { useMutation, useQueryClient } from "@tanstack/react-query";

import { combineEntities } from "@/api/client";
import { campaignKeys } from "@/api/queryKeys";

// The single combine write (#1943, sibling of #1942's endpoint): absorbs
// `duplicateId` into `survivorId` and deletes it. Invalidates the shared
// entities cache (mention chips, the pane rail, EntityInfobox stats) and the
// merges cache (a PREPARED row touching the duplicate may have been repointed
// or cascade-deleted) — the caller navigates to the survivor's own page after
// success, whose backlinks/connections/activity reads are plain per-entity
// effects that refetch on their own from the entityId change, not TanStack
// Query, so there is no third cache to invalidate for them.
export function useCombineEntity(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ duplicateId, survivorId }: { duplicateId: string; survivorId: string }) =>
      combineEntities(campaignId, duplicateId, survivorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: campaignKeys.entities(campaignId) });
      void queryClient.invalidateQueries({ queryKey: campaignKeys.merges(campaignId) });
    },
  });
}
