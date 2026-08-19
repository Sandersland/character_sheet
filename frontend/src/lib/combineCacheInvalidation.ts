import type { QueryClient } from "@tanstack/react-query";

import { campaignKeys, inboxKeys, sessionKeys } from "@/api/queryKeys";

// The one set of caches any combine (#1942's shared endpoint) can go stale,
// shared by both call sites: entity-detail's single-duplicate combine
// (#1943, useCombineEntity) and the inbox's N-way cluster combine (#1946,
// useCombineCluster). Before this was unified, useCombineEntity only
// invalidated entities+merges — combining from the entity-detail page left a
// stale inbox bell and a stale chronicle cache, since combineEntities also
// REWRITES journal entry bodies server-side (every @[loserId] mention token
// becomes @[survivorId]), which a cached chronicle still holding the old
// tokens can't resolve once the loser is gone from the (now-invalidated)
// entities list.
//
// Backlinks/activity (useEntityDetail/useCodexActivity) carry the same
// staleness risk but AREN'T on TanStack Query at all — plain fetch+useEffect
// keyed only on campaignId/entityId — so there is no query cache entry here
// to invalidate for them; fixing that needs migrating those hooks onto
// TanStack Query first, out of scope for a combine mutation.
export function invalidateCombineCaches(queryClient: QueryClient, campaignId: string): void {
  void queryClient.invalidateQueries({ queryKey: inboxKeys.all });
  // Prefix match covers entitiesWithStats — entities() is its key prefix.
  void queryClient.invalidateQueries({ queryKey: campaignKeys.entities(campaignId) });
  void queryClient.invalidateQueries({ queryKey: campaignKeys.merges(campaignId) });
  void queryClient.invalidateQueries({ queryKey: sessionKeys.chronicleForCampaign(campaignId) });
}
