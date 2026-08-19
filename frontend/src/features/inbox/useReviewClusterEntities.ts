import { useQuery } from "@tanstack/react-query";

import { fetchEntities } from "@/api/client";
import { campaignKeys } from "@/api/queryKeys";
import { useCampaignMerges } from "@/hooks/useCampaignMerges";
import type { CampaignEntity } from "@/types/character";

const NONE_ENTITIES: CampaignEntity[] = [];

// The Review-duplicates modal (#1946) needs more than an InboxDuplicateEntity
// carries — notes/aliases/portrait for the Discarded box, PREPARED merges for
// the "combining drops it" warning — so it fetches the campaign's full,
// stats-included entity list rather than trusting the inbox row's summary
// shape. Distinct query key from useCampaignEntities' plain list (see
// campaignKeys.entitiesWithStats) so this stats-shaped response never
// clobbers that cache. Merges reuse the existing useCampaignMerges hook
// rather than re-registering the same query here — same cache key
// (campaignKeys.merges), so both consumers share one entry regardless.
//
// `isLoading`/`isError` fold BOTH queries: the caller's previewReady gate
// needs to know the merges list is settled, not just present-or-empty, or a
// still-in-flight merges fetch lets the Discarded box render as complete
// while a "Prepared identity merges" item is still on its way (#1949).
export function useReviewClusterEntities(campaignId: string) {
  const entitiesQuery = useQuery({
    queryKey: campaignKeys.entitiesWithStats(campaignId),
    queryFn: () => fetchEntities(campaignId, { includeStats: true }),
  });
  const { merges, isPending: mergesPending, isError: mergesError } = useCampaignMerges(campaignId);

  return {
    entities: entitiesQuery.data ?? NONE_ENTITIES,
    merges,
    isLoading: entitiesQuery.isLoading || mergesPending,
    isError: entitiesQuery.isError || mergesError,
  };
}
