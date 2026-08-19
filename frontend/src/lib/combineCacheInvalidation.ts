import type { QueryClient } from "@tanstack/react-query";

import { campaignKeys, characterKeys, inboxKeys } from "@/api/queryKeys";

// The one set of caches any combine (#1942's shared endpoint) can go stale,
// shared by both call sites: entity-detail's single-duplicate combine
// (#1943, useCombineEntity) and the inbox's N-way cluster combine (#1946,
// useCombineCluster).
//
// combineEntities REWRITES journal entry bodies server-side (every
// @[loserId] mention token becomes @[survivorId]) — those bodies live on
// Character.journal (rendered via MentionText), not on sessionKeys.chronicle
// (arcs + session metadata only, no note bodies — see useChronicle's own
// comment). A cached character detail still holding the old token can't
// resolve it once the loser is gone from the (now-invalidated) entities
// list — MentionText renders it as an unresolved/redacted mention instead of
// the survivor's name. The mutation only knows `campaignId`, not which
// characters' journals actually mention a loser, so this invalidates the
// whole characterKeys family rather than enumerating characterIds.
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
  void queryClient.invalidateQueries({ queryKey: characterKeys.all });
}
