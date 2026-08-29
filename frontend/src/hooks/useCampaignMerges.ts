import { skipToken, useQuery } from "@tanstack/react-query";

import { fetchEntityMerges } from "@/api/client";
import { getQueryClient } from "@/api/queryClient";
import { campaignKeys } from "@/api/queryKeys";
import type { CampaignEntityMerge } from "@/types/character";

// Frozen empty array, same reasoning as useCampaignEntities' NONE.
const NONE: CampaignEntityMerge[] = [];

export function primeCampaignMerges(campaignId: string, merges: CampaignEntityMerge[]): void {
  getQueryClient().setQueryData(campaignKeys.merges(campaignId), merges);
}

export function __resetCampaignMergesCacheForTests(): void {
  getQueryClient().clear();
}

// Server-scrubbed by role — a non-owner only ever holds EXECUTED merges
// between revealed identities (#387).
//
// isPending/isError ride alongside `merges` so ReviewDuplicatesModal's
// previewReady gate can tell "still loading" from "loaded, empty" — `merges
// ?? []` alone can't. Removing them breaks that gate (#1949).
export function useCampaignMerges(campaignId?: string | null) {
  const { data, isPending, isError } = useQuery({
    queryKey: campaignKeys.merges(campaignId),
    queryFn: campaignId ? () => fetchEntityMerges(campaignId) : skipToken,
  });

  return { merges: data ?? NONE, isPending, isError };
}
