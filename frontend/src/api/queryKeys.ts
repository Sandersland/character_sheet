// Keys live here so no call site ever string-literals one — a typo'd key is a
// silent cache miss, not a crash. Ids are nullable because a hook with no id
// still needs a stable key while its query is skipped. Campaign-scoped resources
// nest under one prefix so a cross-resource mutation can invalidate a whole
// campaign in one call (#1283).
//
// Namespaces are added incrementally, one per commit, alongside their first
// consumer — an export with no importer yet fails fallow's unused-exports gate.

export const characterKeys = {
  all: ["characters"] as const,
  list: () => [...characterKeys.all, "list"] as const,
  detail: (id: string | null | undefined) => [...characterKeys.all, "detail", id] as const,
};

export const campaignKeys = {
  all: ["campaigns"] as const,
  scope: (id: string | null | undefined) => [...campaignKeys.all, id] as const,
  entities: (id: string | null | undefined) => [...campaignKeys.scope(id), "entities"] as const,
  merges: (id: string | null | undefined) => [...campaignKeys.scope(id), "merges"] as const,
  items: (id: string | null | undefined) => [...campaignKeys.scope(id), "items"] as const,
};

export const referenceKeys = { all: ["reference"] as const };

// The SRD item catalog (`GET /items`) — a separate endpoint from `/reference`,
// so it gets its own key rather than overloading referenceKeys.
export const catalogKeys = { items: () => ["catalog", "items"] as const };

// The character's session-doorway + full-active-session reads (#1299), lifted
// out of LiveSessionProvider's own useState so a lifecycle mutation elsewhere
// (join/start/leave/end) can invalidate them instead of poking a callback.
export const sessionKeys = {
  all: ["sessions"] as const,
  doorway: (characterId: string | null | undefined) => [...sessionKeys.all, "doorway", characterId] as const,
  active: (characterId: string | null | undefined) => [...sessionKeys.all, "active", characterId] as const,
  // A campaign's session list (SessionsModal) — distinct from `chronicle`
  // below: same campaign, but a different endpoint/shape (fetchCampaignSessions
  // vs fetchChronicleSessions), so they cannot share one cache entry.
  campaignList: (campaignId: string | null | undefined) =>
    [...sessionKeys.all, "campaignList", campaignId] as const,
  // The journal's per-character chronicle read (arcs + sessions together, since
  // useChronicle always fetches both in parallel and treats them as one unit).
  chronicle: (campaignId: string | null | undefined, characterId: string | null | undefined) =>
    [...sessionKeys.all, "chronicle", campaignId, characterId] as const,
};
