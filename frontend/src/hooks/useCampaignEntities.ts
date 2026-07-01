import { useEffect, useMemo, useState } from "react";

import { fetchEntities } from "@/api/client";
import type { CampaignEntity } from "@/types/character";

// Module-level cache + subscribers so a campaign's entity list is fetched once
// and shared by every consumer (chip resolver + @-autocomplete); priming after a
// create pushes the fresh list to all live consumers so new chips resolve at once.
const cache = new Map<string, CampaignEntity[]>();
const subscribers = new Map<string, Set<(list: CampaignEntity[]) => void>>();
const inflight = new Map<string, Promise<CampaignEntity[]>>();

export function primeCampaignEntities(campaignId: string, entities: CampaignEntity[]): void {
  cache.set(campaignId, entities);
  subscribers.get(campaignId)?.forEach((notify) => notify(entities));
}

// Test-only: clear all module-level state so one test's cache/subscribers/inflight
// can't leak into the next (the source of MentionAutocomplete.test.tsx flakiness,
// #282). Not used in any production path.
export function __resetCampaignEntitiesCacheForTests(): void {
  cache.clear();
  subscribers.clear();
  inflight.clear();
}

// Dedupe concurrent loads so two consumers mounting together share one request.
function loadCampaignEntities(campaignId: string): Promise<CampaignEntity[]> {
  const existing = inflight.get(campaignId);
  if (existing) return existing;
  const pending = fetchEntities(campaignId).finally(() => inflight.delete(campaignId));
  inflight.set(campaignId, pending);
  return pending;
}

// Fetch + cache the campaign's entities; exposes the list plus an id→entity map
// for resolving @[<uuid>] tokens at render time. No campaign → empty.
export function useCampaignEntities(campaignId?: string | null) {
  const [entities, setEntities] = useState<CampaignEntity[]>(() =>
    campaignId ? cache.get(campaignId) ?? [] : [],
  );

  useEffect(() => {
    if (!campaignId) {
      setEntities([]);
      return;
    }
    const cached = cache.get(campaignId);
    if (cached) setEntities(cached);

    const subs = subscribers.get(campaignId) ?? new Set();
    subs.add(setEntities);
    subscribers.set(campaignId, subs);

    let active = true;
    loadCampaignEntities(campaignId)
      .then((list) => {
        if (active) primeCampaignEntities(campaignId, list);
      })
      .catch(() => {
        // A failed fetch leaves tokens rendering as plain text — acceptable.
      });
    return () => {
      active = false;
      subs.delete(setEntities);
    };
  }, [campaignId]);

  const byId = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  return { entities, byId };
}
