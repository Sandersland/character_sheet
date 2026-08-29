import { useMemo } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";

import { fetchEntities } from "@/api/client";
import { getQueryClient } from "@/api/queryClient";
import { campaignKeys } from "@/api/queryKeys";
import type { CampaignEntity } from "@/types/character";

// Frozen empty array so consumers that memoise on `entities` identity
// (useMentionEditor) don't re-run their memo every render when there is
// simply no campaign.
const NONE: CampaignEntity[] = [];

export function primeCampaignEntities(campaignId: string, entities: CampaignEntity[]): void {
  getQueryClient().setQueryData(campaignKeys.entities(campaignId), entities);
}

export function __resetCampaignEntitiesCacheForTests(): void {
  getQueryClient().clear();
}

export function useCampaignEntities(campaignId?: string | null) {
  const { data } = useQuery({
    queryKey: campaignKeys.entities(campaignId),
    queryFn: campaignId ? () => fetchEntities(campaignId) : skipToken,
  });
  // Errors stay swallowed here (no `error` in the return) — a failed fetch
  // leaves @-tokens rendering as plain text; this is deliberate, not a
  // regression.

  const entities = data ?? NONE;
  const byId = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  return { entities, byId };
}
