import { useMutation, useQueryClient } from "@tanstack/react-query";

import { combineEntities } from "@/api/client";
import { campaignKeys, inboxKeys, sessionKeys } from "@/api/queryKeys";

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
// retry the same combine.
//
// combineEntities also REWRITES journal entry bodies server-side (every
// @[loserId] mention token becomes @[survivorId]), so a cached chronicle
// still holding the old tokens can't resolve them once the loser is gone
// from the (now-invalidated) entities list — it renders literal "@[uuid]"
// text until something refetches it. Invalidating chronicleForCampaign fixes
// that. Backlinks/activity (useEntityDetail/useCodexActivity) carry the same
// staleness risk but AREN'T on TanStack Query at all — plain fetch+useEffect
// keyed only on campaignId/entityId — so there is no query cache entry here
// to invalidate for them; fixing that needs migrating those hooks onto
// TanStack Query first, which is out of scope for this mutation.
export function useCombineCluster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, loserIds, survivorId }: CombineClusterInput) =>
      combineEntities(campaignId, survivorId, loserIds),
    onSuccess: (_data, { campaignId }) => {
      void queryClient.invalidateQueries({ queryKey: inboxKeys.all });
      void queryClient.invalidateQueries({ queryKey: campaignKeys.entities(campaignId) });
      void queryClient.invalidateQueries({ queryKey: campaignKeys.entitiesWithStats(campaignId) });
      void queryClient.invalidateQueries({ queryKey: campaignKeys.merges(campaignId) });
      void queryClient.invalidateQueries({ queryKey: sessionKeys.chronicleForCampaign(campaignId) });
    },
  });
}
