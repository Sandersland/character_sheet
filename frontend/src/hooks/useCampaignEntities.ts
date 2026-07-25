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

// Test-only, and now redundant: the per-test fresh QueryClient in the vitest
// setup file is what prevents cross-test leakage (#282), so callers already run
// against an empty cache. Kept until #1283 retires its four call sites.
export function __resetCampaignEntitiesCacheForTests(): void {
  getQueryClient().clear();
}

// Fetch + cache the campaign's entities; exposes the list plus an id→entity map
// for resolving @[<uuid>] tokens at render time. No campaign → empty.
export function useCampaignEntities(campaignId?: string | null) {
  const { data } = useQuery({
    queryKey: campaignKeys.entities(campaignId),
    queryFn: campaignId ? () => fetchEntities(campaignId) : skipToken,
  });
  // Errors stay swallowed here (no `error` in the return) — a failed entity
  // fetch leaves @-tokens rendering as plain text, which is deliberate
  // documented behaviour, not a regression from the old subscriber model.

  const entities = data ?? NONE;
  const byId = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  return { entities, byId };
}
