import { useEffect, useMemo, useState } from "react";

import { fetchEntities } from "@/api/client";
import type { CampaignEntity } from "@/types/character";

// Module-level cache so the campaign entity list is fetched once and shared by
// every chip render on the sheet (id→entity lookup), not re-fetched per note.
const cache = new Map<string, CampaignEntity[]>();

export function primeCampaignEntities(campaignId: string, entities: CampaignEntity[]): void {
  cache.set(campaignId, entities);
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

    let active = true;
    fetchEntities(campaignId)
      .then((list) => {
        cache.set(campaignId, list);
        if (active) setEntities(list);
      })
      .catch(() => {
        // A failed fetch leaves tokens rendering as plain text — acceptable.
      });
    return () => {
      active = false;
    };
  }, [campaignId]);

  const byId = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  return { entities, byId };
}
