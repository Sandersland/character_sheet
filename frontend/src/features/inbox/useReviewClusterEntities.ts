import { useQuery } from "@tanstack/react-query";

import { fetchEntities, fetchEntityMerges } from "@/api/client";
import { campaignKeys } from "@/api/queryKeys";
import type { CampaignEntity, CampaignEntityMerge } from "@/types/character";

const NONE_ENTITIES: CampaignEntity[] = [];
const NONE_MERGES: CampaignEntityMerge[] = [];

// The Review-duplicates modal (#1946) needs more than an InboxDuplicateEntity
// carries — notes/aliases/portrait for the Discarded box, PREPARED merges for
// the "combining drops it" warning — so it fetches the campaign's full,
// stats-included entity list rather than trusting the inbox row's summary
// shape. Distinct query key from useCampaignEntities' plain list (see
// campaignKeys.entitiesWithStats) so this stats-shaped response never
// clobbers that cache.
export function useReviewClusterEntities(campaignId: string) {
  const entitiesQuery = useQuery({
    queryKey: campaignKeys.entitiesWithStats(campaignId),
    queryFn: () => fetchEntities(campaignId, { includeStats: true }),
  });
  const mergesQuery = useQuery({
    queryKey: campaignKeys.merges(campaignId),
    queryFn: () => fetchEntityMerges(campaignId),
  });

  return {
    entities: entitiesQuery.data ?? NONE_ENTITIES,
    merges: mergesQuery.data ?? NONE_MERGES,
    isLoading: entitiesQuery.isLoading || mergesQuery.isLoading,
  };
}
