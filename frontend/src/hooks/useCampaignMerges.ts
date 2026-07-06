import { useEffect, useState } from "react";

import { fetchEntityMerges } from "@/api/client";
import type { CampaignEntityMerge } from "@/types/character";

// Module-level cache + subscribers so a campaign's merge list is fetched once and
// shared by every consumer (reveal banner, autocomplete annotation, Manage tab);
// priming after a prepare/execute/unmerge pushes the fresh list to all consumers.
// Mirrors useCampaignEntities. The list is server-scrubbed by role — a non-owner
// only ever holds EXECUTED merges between revealed identities (#387).
const cache = new Map<string, CampaignEntityMerge[]>();
const subscribers = new Map<string, Set<(list: CampaignEntityMerge[]) => void>>();
const inflight = new Map<string, Promise<CampaignEntityMerge[]>>();

export function primeCampaignMerges(campaignId: string, merges: CampaignEntityMerge[]): void {
  cache.set(campaignId, merges);
  subscribers.get(campaignId)?.forEach((notify) => notify(merges));
}

export function __resetCampaignMergesCacheForTests(): void {
  cache.clear();
  subscribers.clear();
  inflight.clear();
}

function loadCampaignMerges(campaignId: string): Promise<CampaignEntityMerge[]> {
  const existing = inflight.get(campaignId);
  if (existing) return existing;
  const pending = fetchEntityMerges(campaignId).finally(() => inflight.delete(campaignId));
  inflight.set(campaignId, pending);
  return pending;
}

export function useCampaignMerges(campaignId?: string | null) {
  const [merges, setMerges] = useState<CampaignEntityMerge[]>(() =>
    campaignId ? cache.get(campaignId) ?? [] : [],
  );

  useEffect(() => {
    if (!campaignId) {
      setMerges([]);
      return;
    }
    const cached = cache.get(campaignId);
    if (cached) setMerges(cached);

    const subs = subscribers.get(campaignId) ?? new Set();
    subs.add(setMerges);
    subscribers.set(campaignId, subs);

    let active = true;
    loadCampaignMerges(campaignId)
      .then((list) => {
        if (active) primeCampaignMerges(campaignId, list);
      })
      .catch(() => {
        // A failed fetch just leaves merge annotations off — acceptable.
      });
    return () => {
      active = false;
      subs.delete(setMerges);
    };
  }, [campaignId]);

  return { merges };
}
