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

// Test-only, and now redundant for the same reason as its entities twin: the
// vitest setup file's per-test fresh QueryClient already prevents leakage.
export function __resetCampaignMergesCacheForTests(): void {
  getQueryClient().clear();
}

// The list is server-scrubbed by role — a non-owner only ever holds EXECUTED
// merges between revealed identities (#387).
//
// isPending/isError ride alongside `merges` for a caller that needs to know
// whether the list is COMPLETE, not just present-or-empty — `merges ?? []`
// alone can't distinguish "still loading" from "loaded, empty".
// ReviewDuplicatesModal is that caller: without this, its previewReady gate
// only watched the entities query, so a still-in-flight merges fetch could
// let the Discarded box render as complete while a "Prepared identity
// merges" item was still on its way (#1949). The list's own direct
// consumers (reveal banner, Manage tab) still swallow a fetch error the same
// way they always have — `merges ?? []` — this just exposes isError too, for
// a caller that wants to tell "empty" apart from "failed".
export function useCampaignMerges(campaignId?: string | null) {
  const { data, isPending, isError } = useQuery({
    queryKey: campaignKeys.merges(campaignId),
    queryFn: campaignId ? () => fetchEntityMerges(campaignId) : skipToken,
  });

  return { merges: data ?? NONE, isPending, isError };
}
