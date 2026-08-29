import type { QueryClient } from "@tanstack/react-query";

import { campaignKeys, characterKeys, inboxKeys } from "@/api/queryKeys";

// combineEntities rewrites journal mention tokens server-side, so a cached character detail can hold a stale token; invalidate the whole characterKeys family since the mutation only knows campaignId, not which characters' journals mention a loser.
// Backlinks/activity (useEntityDetail/useCodexActivity) use plain fetch+useEffect, not TanStack Query, so there's no cache entry here to invalidate for them.
export function invalidateCombineCaches(queryClient: QueryClient, campaignId: string): void {
  void queryClient.invalidateQueries({ queryKey: inboxKeys.all });
  // Prefix match covers entitiesWithStats — entities() is its key prefix.
  void queryClient.invalidateQueries({ queryKey: campaignKeys.entities(campaignId) });
  void queryClient.invalidateQueries({ queryKey: campaignKeys.merges(campaignId) });
  void queryClient.invalidateQueries({ queryKey: characterKeys.all });
}
