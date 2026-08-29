// Keys live here so no call site ever string-literals one — a typo'd key
// is a silent cache miss, not a crash. Ids are nullable because a hook
// with no id still needs a stable key while its query is skipped.
// Campaign-scoped resources nest under one prefix so a cross-resource
// mutation can invalidate a whole campaign in one call.

import type { RulesEdition } from "@character-sheet/shared-types";

export const characterKeys = {
  all: ["characters"] as const,
  list: () => [...characterKeys.all, "list"] as const,
  detail: (id: string | null | undefined) => [...characterKeys.all, "detail", id] as const,
};

export const campaignKeys = {
  all: ["campaigns"] as const,
  scope: (id: string | null | undefined) => [...campaignKeys.all, id] as const,
  entities: (id: string | null | undefined) => [...campaignKeys.scope(id), "entities"] as const,
  // Separate from `entities` above: this fetches with `?include=stats`
  // (mentionCount/hasDescription), and priming the plain-list cache with a
  // stats-shaped response would be a lie the next plain reader trusts.
  entitiesWithStats: (id: string | null | undefined) =>
    [...campaignKeys.scope(id), "entities", "stats"] as const,
  merges: (id: string | null | undefined) => [...campaignKeys.scope(id), "merges"] as const,
  items: (id: string | null | undefined) => [...campaignKeys.scope(id), "items"] as const,
};

export const referenceKeys = {
  all: ["reference"] as const,
  // The edition is cache IDENTITY, not a filter: /reference serves values
  // already resolved through subclassGateLevel and resolveEditionCatalog, so a
  // 2014 payload handed to a 2024 surface would gate a form control on the
  // wrong rule (#1325). `all` stays the prefix so one invalidate clears both.
  byEdition: (edition: RulesEdition | null | undefined) =>
    [...referenceKeys.all, edition] as const,
};

// Separate endpoint from /reference, so it gets its own key rather than
// overloading referenceKeys.
export const catalogKeys = {
  items: () => ["catalog", "items"] as const,
  // Takes no edition argument, unlike referenceKeys.byEdition: /editions
  // must be answerable before an edition exists (#1436) — adding one "for
  // symmetry" would reintroduce that dependency.
  editions: () => ["catalog", "editions"] as const,
};

// Lifted out of LiveSessionProvider's own useState so a lifecycle mutation
// elsewhere (join/start/leave/end) can invalidate these instead of poking a
// callback.
export const sessionKeys = {
  all: ["sessions"] as const,
  doorway: (characterId: string | null | undefined) => [...sessionKeys.all, "doorway", characterId] as const,
  active: (characterId: string | null | undefined) => [...sessionKeys.all, "active", characterId] as const,
  // Distinct from `chronicle` below: same campaign, but a different
  // endpoint/shape (fetchCampaignSessions vs fetchChronicleSessions), so
  // they cannot share one cache entry.
  campaignList: (campaignId: string | null | undefined) =>
    [...sessionKeys.all, "campaignList", campaignId] as const,
  // arcs + sessions together: useChronicle always fetches both in parallel
  // and treats them as one unit.
  chronicle: (campaignId: string | null | undefined, characterId: string | null | undefined) =>
    [...sessionKeys.all, "chronicle", campaignId, characterId] as const,
};

// One flat list across every campaign — no per-id variant, so `all`
// doubles as the query key.
export const inboxKeys = {
  all: ["inbox"] as const,
};
