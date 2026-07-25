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
export function useCampaignMerges(campaignId?: string | null) {
  const { data } = useQuery({
    queryKey: campaignKeys.merges(campaignId),
    queryFn: campaignId ? () => fetchEntityMerges(campaignId) : skipToken,
  });
  // Errors stay swallowed here too — a failed fetch just leaves merge
  // annotations off, same deliberate behaviour as before the migration.

  return { merges: data ?? NONE };
}
