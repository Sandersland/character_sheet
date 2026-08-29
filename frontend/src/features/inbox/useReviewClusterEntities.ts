import { useQuery } from "@tanstack/react-query";

import { fetchEntities } from "@/api/client";
import { campaignKeys } from "@/api/queryKeys";
import { useCampaignMerges } from "@/hooks/useCampaignMerges";
import type { CampaignEntity } from "@/types/character";

const NONE_ENTITIES: CampaignEntity[] = [];

// entitiesWithStats is a distinct query key from useCampaignEntities' plain list (so it can't clobber that cache); merges are read through the shared useCampaignMerges cache entry (campaignKeys.merges) instead of a separate query.
//
// isLoading/isError fold in the merges query too, so previewReady doesn't treat an in-flight merges fetch as already-complete (#1949).
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
