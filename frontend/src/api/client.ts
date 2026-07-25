import type {
  AdvancementOperation,
  Campaign,
  CampaignItem,
  CampaignItemHolder,
  CampaignItemInput,
  CampaignArc,
  Character,
  CharacterEvent,
  ChronicleSession,
  ClassOperation,
  CampaignEntity,
  CampaignEntityMerge,
  CodexActivityItem,
  EntityBacklink,
  EntityConnection,
  EntityType,
  EntityVisibility,
  EntryVisibility,
  JournalEntryKind,
  LevelUpPlanResponse,
  LevelUpSubmission,
  LevelUpTarget,
  Session,
  SessionDoorwayState,
} from "@/types/character";
export { setUnauthorizedHandler } from "@/api/http";
import { jsonBody, postTransactions, request, send } from "@/api/http";

export * from "@/api/auth";
export * from "@/api/catalog";
export * from "@/api/spells";
export * from "@/api/inventory";
export * from "@/api/abilities";
export * from "@/api/characters";

// Journal CRUD. Plain REST (no transaction/op batching) — journal entries carry no mechanical
// effect, so they aren't routed through the audit log. Each call returns the
// full updated Character so the caller can swap its state in one assignment.

// kind defaults to ENTRY; NOTE omits date (server fills it with today).
export async function createJournalEntry(
  characterId: string,
  entry: {
    kind?: JournalEntryKind;
    date?: string;
    body: string;
    sessionId?: string;
    visibility?: EntryVisibility;
  }
): Promise<Character> {
  return request<Character>(
    `/characters/${characterId}/journal`,
    jsonBody(entry),
    "Failed to create journal entry",
  );
}

export async function updateJournalEntry(
  characterId: string,
  entryId: string,
  patch: { date?: string; body?: string; visibility?: EntryVisibility }
): Promise<Character> {
  return request<Character>(
    `/characters/${characterId}/journal/${entryId}`,
    jsonBody(patch, "PATCH"),
    "Failed to update journal entry",
  );
}

export async function deleteJournalEntry(
  characterId: string,
  entryId: string
): Promise<Character> {
  return request<Character>(
    `/characters/${characterId}/journal/${entryId}`,
    { method: "DELETE" },
    "Failed to delete journal entry",
  );
}

// Applies class-level mutations (today: setSubclass). Returns the updated character.
export async function applyClassTransactions(
  characterId: string,
  operations: ClassOperation[]
): Promise<Character> {
  return postTransactions(characterId, "class", operations, "Failed to apply class operations");
}

// Applies advancement operations (takeAsi / takeFeat / removeAdvancement).
// Returns the full updated Character on success.
export async function applyAdvancementTransactions(
  characterId: string,
  operations: AdvancementOperation[]
): Promise<Character> {
  return postTransactions(characterId, "advancement", operations, "Failed to apply advancement operations");
}

// The derived level-up ceremony plan (#886): resolved target + ordered steps.
// `subclassId` triggers the server-side re-plan for a not-yet-committed subclass
// pick. Read-only — nothing is mutated.
export async function fetchLevelUpPlan(
  characterId: string,
  target: LevelUpTarget,
  subclassId?: string,
): Promise<LevelUpPlanResponse> {
  const params = new URLSearchParams();
  if (target.kind === "existing") params.set("classEntryId", target.classEntryId);
  else params.set("classId", target.classId);
  if (subclassId) params.set("subclassId", subclassId);
  return request<LevelUpPlanResponse>(
    `/characters/${characterId}/level-up/plan?${params.toString()}`,
    undefined,
    "Failed to fetch level-up plan",
  );
}

// Commits one whole level-up ceremony atomically. The submission is the body
// verbatim (see the postTransactions note above); returns the leveled Character.
export async function submitLevelUp(
  characterId: string,
  submission: LevelUpSubmission,
): Promise<Character> {
  return request<Character>(
    `/characters/${characterId}/level-up/transactions`,
    jsonBody(submission),
    "Failed to apply level-up",
  );
}

// Campaigns (#246). Plain REST: list/create/join/attach. The attach call returns
// the full updated Character (same shape as every character-mutating endpoint).

export async function fetchCampaigns(): Promise<Campaign[]> {
  return request<Campaign[]>("/campaigns", undefined, "Failed to fetch campaigns");
}

export async function createCampaign(name: string): Promise<Campaign> {
  return request<Campaign>("/campaigns", jsonBody({ name }), "Failed to create campaign");
}

export async function fetchCampaign(id: string): Promise<Campaign> {
  return request<Campaign>(`/campaigns/${id}`, undefined, `Failed to fetch campaign ${id}`);
}

export async function joinCampaign(inviteCode: string): Promise<Campaign> {
  return request<Campaign>("/campaigns/join", jsonBody({ inviteCode }), "Failed to join campaign");
}

export async function addCharacterToCampaign(
  characterId: string,
  campaignId: string,
): Promise<Character> {
  return request<Character>(
    `/campaigns/${campaignId}/characters`,
    jsonBody({ characterId }),
    "Failed to add character to campaign",
  );
}

// Campaign entities & @-tagging (#248). Plain REST. Search/list is campaign-scoped;
// create/edit are any-member; delete is OWNER-only (server-enforced). Backlinks come
// pre-filtered server-side to the caller's own notes plus other members' CAMPAIGN-
// shared ones (#838), so no client-side visibility logic is needed.

export async function fetchEntities(
  campaignId: string,
  opts?: { q?: string; type?: EntityType; includeStats?: boolean },
): Promise<CampaignEntity[]> {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.type) params.set("type", opts.type);
  if (opts?.includeStats) params.set("include", "stats");
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<CampaignEntity[]>(
    `/campaigns/${campaignId}/entities${query}`,
    undefined,
    "Failed to fetch entities",
  );
}

export async function createEntity(
  campaignId: string,
  input: {
    type: EntityType;
    name: string;
    aliases?: string[];
    notes?: string;
    portraitUrl?: string | null;
    visibility?: EntityVisibility;
  },
): Promise<CampaignEntity> {
  return request<CampaignEntity>(
    `/campaigns/${campaignId}/entities`,
    jsonBody(input),
    "Failed to create entity",
  );
}

export async function updateEntity(
  campaignId: string,
  entityId: string,
  patch: {
    type?: EntityType;
    name?: string;
    aliases?: string[];
    notes?: string | null;
    portraitUrl?: string | null;
    visibility?: EntityVisibility;
  },
): Promise<CampaignEntity> {
  return request<CampaignEntity>(
    `/campaigns/${campaignId}/entities/${entityId}`,
    jsonBody(patch, "PATCH"),
    "Failed to update entity",
  );
}

export async function deleteEntity(campaignId: string, entityId: string): Promise<void> {
  await send(
    `/campaigns/${campaignId}/entities/${entityId}`,
    { method: "DELETE" },
    "Failed to delete entity",
  );
}

export async function fetchEntityBacklinks(
  campaignId: string,
  entityId: string,
): Promise<EntityBacklink[]> {
  return request<EntityBacklink[]>(
    `/campaigns/${campaignId}/entities/${entityId}/backlinks`,
    undefined,
    "Failed to fetch entity backlinks",
  );
}

export async function fetchEntityConnections(
  campaignId: string,
  entityId: string,
  opts?: { limit?: number },
): Promise<EntityConnection[]> {
  const query = opts?.limit ? `?limit=${opts.limit}` : "";
  return request<EntityConnection[]>(
    `/campaigns/${campaignId}/entities/${entityId}/connections${query}`,
    undefined,
    "Failed to fetch entity connections",
  );
}

export async function fetchEntityActivity(
  campaignId: string,
  opts?: { limit?: number },
): Promise<CodexActivityItem[]> {
  const query = opts?.limit ? `?limit=${opts.limit}` : "";
  return request<CodexActivityItem[]>(
    `/campaigns/${campaignId}/entities/activity${query}`,
    undefined,
    "Failed to fetch codex activity",
  );
}

// Entity identity merges (#387). Owner-only writes (prepare/execute/unmerge). The
// list is scrubbed server-side: a non-owner only ever receives EXECUTED merges
// between revealed identities.

export async function fetchEntityMerges(campaignId: string): Promise<CampaignEntityMerge[]> {
  return request<CampaignEntityMerge[]>(
    `/campaigns/${campaignId}/entities/merges`,
    undefined,
    "Failed to fetch entity merges",
  );
}

export async function prepareEntityMerge(
  campaignId: string,
  input: { mergedEntityId: string; survivorEntityId: string; note?: string },
): Promise<CampaignEntityMerge> {
  return request<CampaignEntityMerge>(
    `/campaigns/${campaignId}/entities/merges`,
    jsonBody(input),
    "Failed to prepare merge",
  );
}

export async function executeEntityMerge(
  campaignId: string,
  mergeId: string,
): Promise<CampaignEntityMerge> {
  return request<CampaignEntityMerge>(
    `/campaigns/${campaignId}/entities/merges/${mergeId}/execute`,
    { method: "POST" },
    "Failed to execute merge",
  );
}

export async function unmergeEntityMerge(campaignId: string, mergeId: string): Promise<void> {
  await send(
    `/campaigns/${campaignId}/entities/merges/${mergeId}`,
    { method: "DELETE" },
    "Failed to unmerge",
  );
}

// Campaign items (#380). Owner-only CRUD (list/create/update/delete).
// fetchCampaignItemByEntity is the member-readable Codex read, keyed by the fronting
// entity — non-owners get it only when that entity is revealed, and never see
// dmNotes (scrubbed server-side).

export async function fetchCampaignItems(campaignId: string): Promise<CampaignItem[]> {
  return request<CampaignItem[]>(`/campaigns/${campaignId}/items`, undefined, "Failed to fetch campaign items");
}

export async function fetchCampaignItemByEntity(
  campaignId: string,
  entityId: string,
): Promise<CampaignItem> {
  return request<CampaignItem>(
    `/campaigns/${campaignId}/items/by-entity/${entityId}`,
    undefined,
    "Failed to fetch campaign item",
  );
}

export async function createCampaignItem(
  campaignId: string,
  input: CampaignItemInput,
): Promise<CampaignItem> {
  return request<CampaignItem>(
    `/campaigns/${campaignId}/items`,
    jsonBody(input),
    "Failed to create campaign item",
  );
}

export async function updateCampaignItem(
  campaignId: string,
  itemId: string,
  patch: Partial<CampaignItemInput>,
): Promise<CampaignItem> {
  return request<CampaignItem>(
    `/campaigns/${campaignId}/items/${itemId}`,
    jsonBody(patch, "PATCH"),
    "Failed to update campaign item",
  );
}

export async function deleteCampaignItem(campaignId: string, itemId: string): Promise<void> {
  await send(`/campaigns/${campaignId}/items/${itemId}`, { method: "DELETE" }, "Failed to delete campaign item");
}

// Award/revoke (#381): owner-only. Grants a campaign item into a member
// character's inventory (reveals the entity, audits on the target) or removes
// the provenance-matched row. Both return the item's updated holder list.
export async function awardCampaignItem(
  campaignId: string,
  itemId: string,
  body: { characterId: string; quantity?: number; sessionId?: string },
): Promise<{ holders: CampaignItemHolder[] }> {
  return request<{ holders: CampaignItemHolder[] }>(
    `/campaigns/${campaignId}/items/${itemId}/award`,
    jsonBody(body),
    "Failed to award campaign item",
  );
}

export async function revokeCampaignItem(
  campaignId: string,
  itemId: string,
  body: { characterId: string },
): Promise<{ holders: CampaignItemHolder[] }> {
  return request<{ holders: CampaignItemHolder[] }>(
    `/campaigns/${campaignId}/items/${itemId}/revoke`,
    jsonBody(body),
    "Failed to revoke campaign item",
  );
}

/** Start a shared campaign session with the given character as first participant. */
export async function startCampaignSession(
  campaignId: string,
  characterId: string,
  title?: string,
): Promise<{ session: Session; character: Character }> {
  return request<{ session: Session; character: Character }>(
    `/campaigns/${campaignId}/sessions`,
    jsonBody({ characterId, title }),
    "Failed to start session",
  );
}

// Solo sessions (#1082) live on the character, not a campaign — a campaign-less
// character starts/ends its own private session through these character-scoped
// routes (#1081). Same response shapes as the campaign start/end so the shared
// doorway + lifecycle plumbing branches only on which call to make.

/** Start a solo (campaign-less) session for a character. */
export async function startSoloSession(
  characterId: string,
  title?: string,
): Promise<{ session: Session; character: Character }> {
  return request<{ session: Session; character: Character }>(
    `/characters/${characterId}/sessions`,
    jsonBody({ title }),
    "Failed to start session",
  );
}

/** End a solo session by id. */
export async function endSoloSession(
  characterId: string,
  sessionId: string,
): Promise<{ session: Session }> {
  return request<{ session: Session }>(
    `/characters/${characterId}/sessions/${sessionId}/end`,
    { method: "POST" },
    "Failed to end session",
  );
}

/** Add (or re-add) a character to an active campaign session. */
export async function joinSession(
  campaignId: string,
  sessionId: string,
  characterId: string,
): Promise<void> {
  await send(
    `/campaigns/${campaignId}/sessions/${sessionId}/join`,
    jsonBody({ characterId }),
    "Failed to join session",
  );
}

/** Record that a character left a session; it stays open for the rest of the party. */
export async function leaveSession(
  campaignId: string,
  sessionId: string,
  characterId: string,
): Promise<void> {
  await send(
    `/campaigns/${campaignId}/sessions/${sessionId}/leave`,
    jsonBody({ characterId }),
    "Failed to leave session",
  );
}

/** End a shared campaign session by id. */
export async function endSession(
  campaignId: string,
  sessionId: string,
): Promise<{ session: Session }> {
  return request<{ session: Session }>(
    `/campaigns/${campaignId}/sessions/${sessionId}/end`,
    { method: "POST" },
    "Failed to end session",
  );
}

/** List a campaign's sessions (newest first), with participants. */
export async function fetchCampaignSessions(campaignId: string): Promise<Session[]> {
  return request<Session[]>(`/campaigns/${campaignId}/sessions`, undefined, "Failed to fetch sessions");
}

/** List sessions a character participated in (newest first) — activity filter. */
export async function fetchSessions(characterId: string): Promise<Session[]> {
  return request<Session[]>(`/characters/${characterId}/sessions`, undefined, "Failed to fetch sessions");
}

// Journal chronicle (#863/#864). The read model behind the field-chronicle page:
// the campaign's arcs ("parts") and its sessions ("chapters") with derived
// sessionNumber + this character's per-session noteCount. A member sees every
// session of their campaign; passing a characterId that isn't the caller's own
// 403s server-side.

/** The campaign's arcs / "parts", ordered by position asc (story order). */
export async function fetchCampaignArcs(campaignId: string): Promise<CampaignArc[]> {
  return request<CampaignArc[]>(
    `/campaigns/${campaignId}/arcs`,
    undefined,
    "Failed to fetch campaign arcs",
  );
}

/** The chronicle session list (newest first) for a character — chapters + parts. */
export async function fetchChronicleSessions(
  campaignId: string,
  characterId: string,
): Promise<ChronicleSession[]> {
  return request<ChronicleSession[]>(
    `/campaigns/${campaignId}/sessions?characterId=${encodeURIComponent(characterId)}`,
    undefined,
    "Failed to fetch chronicle sessions",
  );
}

/**
 * Set (or clear) a session's chapter title. Any session PARTICIPANT may edit it
 * after the fact (#863); a non-participant 403s. Returns the updated session.
 */
export async function updateSessionTitle(
  campaignId: string,
  sessionId: string,
  title: string | null,
): Promise<Session> {
  return request<Session>(
    `/campaigns/${campaignId}/sessions/${sessionId}`,
    jsonBody({ title }, "PATCH"),
    "Failed to update session title",
  );
}

/** Get the currently-active session, or null if none is active. */
export async function fetchActiveSession(characterId: string): Promise<Session | null> {
  // 200 with null body when no session is active.
  return request<Session | null>(
    `/characters/${characterId}/sessions/active`,
    undefined,
    "Failed to fetch active session",
  );
}

/**
 * Get the sheet's session-doorway state (#942) — the one state-aware fact set the
 * SessionDoorway bar renders. Solo characters get `campaignId: null` (bar absent).
 */
export async function fetchSessionDoorway(characterId: string): Promise<SessionDoorwayState> {
  return request<SessionDoorwayState>(
    `/characters/${characterId}/sessions/doorway`,
    undefined,
    "Failed to fetch session doorway",
  );
}

/** Get one session with its events. */
export async function fetchSession(
  characterId: string,
  sessionId: string,
): Promise<Session & { events: CharacterEvent[] }> {
  return request<Session & { events: CharacterEvent[] }>(
    `/characters/${characterId}/sessions/${sessionId}`,
    undefined,
    "Failed to fetch session",
  );
}

/** Log a "combat started" event against the active session. */
export async function startCombat(
  characterId: string,
  sessionId: string,
): Promise<void> {
  await send(
    `/characters/${characterId}/sessions/${sessionId}/combat/start`,
    { method: "POST" },
    "Failed to start combat",
  );
}

/** Log a "combat ended" event against the active session. */
export async function endCombat(
  characterId: string,
  sessionId: string,
): Promise<void> {
  await send(
    `/characters/${characterId}/sessions/${sessionId}/combat/end`,
    { method: "POST" },
    "Failed to end combat",
  );
}

/** Log a "combat round advanced" event against the active session. */
export async function advanceCombatRound(
  characterId: string,
  sessionId: string,
  round: number,
): Promise<void> {
  await send(
    `/characters/${characterId}/sessions/${sessionId}/combat/round`,
    jsonBody({ round }),
    "Failed to advance combat round",
  );
}

/** Log a single roll from the session UI. Best-effort — callers catch and console.error. */
export async function logRoll(
  characterId: string,
  sessionId: string,
  payload: {
    kind: "attack" | "damage" | "check" | "save" | "initiative";
    source: string;
    total: number;
    specLabel?: string;
    damageType?: string;
    /** Raw kept die faces (non-dropped) so the Session Log can show the breakdown. */
    faces?: number[];
    /** Ability key for check/save rolls — source carries the display text. */
    ability?: string;
    /** Skill key for check rolls. */
    skill?: string;
    /** Target difficulty class, when the roll is made against one. */
    dc?: number;
    /** Advantage state the d20 was rolled with. */
    rollMode?: "normal" | "advantage" | "disadvantage";
  },
): Promise<void> {
  await send(
    `/characters/${characterId}/sessions/${sessionId}/roll`,
    jsonBody(payload),
    "Failed to log roll",
  );
}
