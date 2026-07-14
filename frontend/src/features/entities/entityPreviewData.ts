import { fetchEntities, fetchEntityConnections } from "@/api/client";
import type { EntityConnection, EntityStats } from "@/types/character";

// Hover-preview lazy caches: one stats fetch per campaign, one connections fetch per entity.

const statsCache = new Map<string, Map<string, EntityStats>>();
const statsInflight = new Map<string, Promise<Map<string, EntityStats>>>();
const connectionsCache = new Map<string, EntityConnection[]>();
const connectionsInflight = new Map<string, Promise<EntityConnection[]>>();

export function getPreviewStats(campaignId: string): Promise<Map<string, EntityStats>> {
  const cached = statsCache.get(campaignId);
  if (cached) return Promise.resolve(cached);
  const pending = statsInflight.get(campaignId);
  if (pending) return pending;
  const load = fetchEntities(campaignId, { includeStats: true })
    .then((list) => {
      const map = new Map<string, EntityStats>();
      for (const e of list) if (e.stats) map.set(e.id, e.stats);
      return map;
    })
    // A failed fetch caches empty so hover can't become a retry storm.
    .catch(() => new Map<string, EntityStats>())
    .then((map) => {
      statsCache.set(campaignId, map);
      statsInflight.delete(campaignId);
      return map;
    });
  statsInflight.set(campaignId, load);
  return load;
}

export function getPreviewConnections(
  campaignId: string,
  entityId: string,
): Promise<EntityConnection[]> {
  const key = `${campaignId}:${entityId}`;
  const cached = connectionsCache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = connectionsInflight.get(key);
  if (pending) return pending;
  const load = fetchEntityConnections(campaignId, entityId, { limit: 3 })
    .catch(() => [])
    .then((list) => {
      connectionsCache.set(key, list);
      connectionsInflight.delete(key);
      return list;
    });
  connectionsInflight.set(key, load);
  return load;
}

// Test-only: clear module state so one test's cache can't leak into the next.
export function __resetEntityPreviewCacheForTests(): void {
  statsCache.clear();
  statsInflight.clear();
  connectionsCache.clear();
  connectionsInflight.clear();
}
