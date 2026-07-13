import type {
  ActionOperation,
  AdvancementOperation,
  Campaign,
  CampaignItem,
  CampaignItemHolder,
  CampaignItemInput,
  CampaignPreferences,
  CatalogFeat,
  CatalogDiscipline,
  CatalogManeuver,
  CatalogShadowArt,
  CatalogChannelDivinity,
  CatalogSpell,
  Character,
  DisciplineOperation,
  ShadowArtOperation,
  ChannelDivinityOperation,
  CharacterEvent,
  ConcentrationCheck,
  CharacterSummary,
  ClassOperation,
  ConditionOperation,
  CampaignEntity,
  CampaignEntityMerge,
  CodexActivityItem,
  CreateCharacterInput,
  EntityBacklink,
  EntityConnection,
  EntityType,
  EntityVisibility,
  EntryVisibility,
  ExperienceOperation,
  HitPointOperation,
  JournalEntryKind,
  InventoryOperation,
  Item,
  ManeuverOperation,
  ManeuverCastResult,
  ReferenceData,
  ResourceOperation,
  Session,
  SpellcastingOperation,
} from "@/types/character";
import type { AuthProviderInfo, AuthUser } from "@/types/auth";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

// Centralized handling for an expired/absent session. AuthProvider registers a
// handler (which flips auth state to "anonymous" so the router shows the login
// screen) so a 401 from ANY domain call is handled in one place — never per
// call site. The auth bootstrap (fetchMe) deliberately bypasses this: a 401
// there is the expected "not signed in" answer, not a session that just died.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

// Always send the session cookie (cross-origin in dev: 5173 → 4000), and route
// every domain response through the shared 401 handler.
async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, { credentials: "include", ...init });
  if (response.status === 401) unauthorizedHandler?.();
  return response;
}

// New endpoint? return request<T>(path, init, "Failed to …") for a JSON reply, or send(path, init, "Failed to …") for a void/204 one.

// Shared non-ok handling: surface the server's { error } message, else a labeled fallback.
async function throwIfNotOk(response: Response, errorLabel: string): Promise<void> {
  if (response.ok) return;
  const body = await response.json().catch(() => null);
  throw new Error(body?.error ?? `${errorLabel} (${response.status})`);
}

// apiFetch → ok-check → parsed JSON. The one flow every JSON-returning helper funnels through.
async function request<T>(path: string, init: RequestInit | undefined, errorLabel: string): Promise<T> {
  const response = await apiFetch(`${API_URL}${path}`, init);
  await throwIfNotOk(response, errorLabel);
  return response.json() as Promise<T>;
}

// apiFetch → ok-check for endpoints with no body to parse (deletes, 204s, best-effort logs).
async function send(path: string, init: RequestInit | undefined, errorLabel: string): Promise<void> {
  const response = await apiFetch(`${API_URL}${path}`, init);
  await throwIfNotOk(response, errorLabel);
}

// JSON headers for a POST/PATCH body — shared by every write helper below.
const jsonBody = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// Shared POST-check-throw-json flow for the intent-bearing transaction endpoints:
// POST …/characters/:id/<domain>/transactions with { operations }, returning the
// full updated Character. Every uniform domain funnels through here — the only
// per-domain differences are the URL segment and the error label. (applyHitPoint-
// Operations and applyExperienceOperations deliberately don't use this: HP unwraps
// { character, concentrationChecks } and XP threads an optional sessionId.)
async function postTransactions<TOp>(
  characterId: string,
  domain: string,
  operations: TOp[],
  errorLabel: string,
): Promise<Character> {
  return request<Character>(
    `/characters/${characterId}/${domain}/transactions`,
    jsonBody({ operations }),
    errorLabel,
  );
}

// ── Auth ────────────────────────────────────────────────────────────────────

// The enabled sign-in providers — drives the login screen's buttons (data-driven
// so adding a provider server-side needs no frontend change). Public endpoint.
export async function fetchAuthProviders(): Promise<AuthProviderInfo[]> {
  const data = await request<{ providers: AuthProviderInfo[] }>(
    "/auth/providers",
    undefined,
    "Failed to fetch auth providers",
  );
  return data.providers;
}

// The current session's user, or null when not signed in. Uses a plain
// credentialed fetch (not apiFetch) so an expected 401 here does NOT trip the
// global unauthorized handler — this IS the "are we signed in?" probe.
export async function fetchMe(): Promise<AuthUser | null> {
  const response = await fetch(`${API_URL}/auth/me`, { credentials: "include" });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`Failed to fetch current user (${response.status})`);
  }
  const data = (await response.json()) as { user: AuthUser };
  return data.user;
}

// End the session server-side and clear the cookie.
export async function logout(): Promise<void> {
  await send("/auth/logout", { method: "POST" }, "Failed to log out");
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await apiFetch(`${API_URL}/health`);
    if (!response.ok) return false;
    const data = await response.json();
    return data.status === "ok";
  } catch {
    return false;
  }
}

export async function fetchCharacters(): Promise<CharacterSummary[]> {
  return request<CharacterSummary[]>("/characters", undefined, "Failed to fetch characters");
}

export async function fetchCharacter(id: string): Promise<Character | null> {
  const response = await apiFetch(`${API_URL}/characters/${id}`);
  // 404 (missing) and 403 (not the caller's) both resolve to null so the sheet
  // page renders its graceful "not found" screen — and a 403 doesn't reveal that
  // the character exists. (A 401 is handled globally by apiFetch → login.)
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) {
    throw new Error(`Failed to fetch character ${id} (${response.status})`);
  }
  return response.json();
}

export async function updateCharacter(
  id: string,
  // experiencePoints is intentionally absent: use applyExperienceOperations
  // instead so XP changes are logged and trigger HP auto-reverse on level-down.
  patch: Partial<Pick<Character, "currency">>
): Promise<Character> {
  return request<Character>(`/characters/${id}`, jsonBody(patch, "PATCH"), `Failed to update character ${id}`);
}

// Updates the character's campaign-scoped play preferences (#537) — a thin
// owner-only PATCH that upserts the row for the character's current campaign.
// Partial: only the sent flags change. Returns the full updated Character.
export async function updateCampaignPreferences(
  id: string,
  patch: Partial<CampaignPreferences>,
): Promise<Character> {
  return request<Character>(
    `/characters/${id}/campaign-preferences`,
    jsonBody(patch, "PATCH"),
    "Failed to update campaign preferences",
  );
}

export async function fetchReference(): Promise<ReferenceData> {
  return request<ReferenceData>("/reference", undefined, "Failed to fetch reference data");
}

// Feeds the inventory editor's "add from catalog" picker (Phase B).
export async function fetchItems(): Promise<Item[]> {
  return request<Item[]>("/items", undefined, "Failed to fetch items");
}

// Feeds the spellcasting section's "learn from catalog" picker.
// Ordered by level then name server-side; no client-side re-sort needed.
export async function fetchSpells(): Promise<CatalogSpell[]> {
  return request<CatalogSpell[]>("/spells", undefined, "Failed to fetch spell catalog");
}

// Applies a batch of spellcasting operations atomically: cast, expend/restore
// slots, learn/forget spells, prepare/unprepare. Mirrors applyInventoryTransactions
// — same intent-bearing batch pattern, full updated Character returned on success.
export async function applySpellcastingTransactions(
  characterId: string,
  operations: SpellcastingOperation[]
): Promise<Character> {
  return postTransactions(characterId, "spellcasting", operations, "Failed to apply spellcasting operations");
}

// Feeds the Four Elements monk's discipline picker (min level + ki cost + ki-scaled effect).
export async function fetchDisciplines(): Promise<CatalogDiscipline[]> {
  return request<CatalogDiscipline[]>("/disciplines", undefined, "Failed to fetch discipline catalog");
}

// Applies a batch of discipline operations atomically: castDiscipline (spend ki,
// roll the discipline's EffectSpec). Full updated Character returned on success.
export async function applyDisciplineTransactions(
  characterId: string,
  operations: DisciplineOperation[]
): Promise<Character> {
  return postTransactions(characterId, "disciplines", operations, "Failed to apply discipline operations");
}

// Feeds the Way of Shadow monk's Shadow Arts picker — 4 flat 2-ki ki-cast spells.
export async function fetchShadowArts(): Promise<CatalogShadowArt[]> {
  return request<CatalogShadowArt[]>("/shadow-arts", undefined, "Failed to fetch shadow arts catalog");
}

// Applies a batch of Shadow Arts operations atomically: castShadowArt (spend a
// flat 2 ki, apply concentration/buff). Full updated Character returned on success.
export async function applyShadowArtsTransactions(
  characterId: string,
  operations: ShadowArtOperation[]
): Promise<Character> {
  return postTransactions(characterId, "shadow-arts", operations, "Failed to apply shadow arts operations");
}

// Feeds the Cleric/Paladin Channel Divinity picker — the entitled options for
// this character (gated per class/subclass/level), each with its save DC + reminder.
export async function fetchChannelDivinity(characterId: string): Promise<CatalogChannelDivinity[]> {
  return request<CatalogChannelDivinity[]>(
    `/characters/${characterId}/channel-divinity`,
    undefined,
    "Failed to fetch Channel Divinity options",
  );
}

// Applies a batch of Channel Divinity operations atomically: castChannelDivinity
// (spend 1 CD charge, apply the option's real side effect). Full updated Character.
export async function applyChannelDivinityTransactions(
  characterId: string,
  operations: ChannelDivinityOperation[]
): Promise<Character> {
  return postTransactions(characterId, "channel-divinity", operations, "Failed to apply Channel Divinity operations");
}

// One inline edit is a batch of one operation; a bulk action (e.g. selling
// several stacks at once) is a batch of several — see backend's
// lib/inventory/inventory.ts for the atomicity/ledger semantics.
export async function applyInventoryTransactions(
  characterId: string,
  operations: InventoryOperation[]
): Promise<Character> {
  return postTransactions(characterId, "inventory", operations, "Failed to apply inventory transactions");
}

// Applies a batch of HP operations atomically (damage, heal, rest, level-up,
// death saves). Mirrors applyInventoryTransactions — same intent-bearing
// batch pattern, full updated Character returned on success.
//
// The response is the serialized character plus `concentrationChecks` — the
// auto-rolled CON save(s) made when a concentrating character takes damage
// (issue #41). We split them apart so callers get a clean Character to store and
// the check list to surface (toast). `concentrationChecks` defaults to [] for
// older servers / non-damage ops.
export async function applyHitPointOperations(
  characterId: string,
  operations: HitPointOperation[]
): Promise<{ character: Character; concentrationChecks: ConcentrationCheck[] }> {
  const { concentrationChecks = [], ...character } = await request<
    Character & { concentrationChecks?: ConcentrationCheck[] }
  >(`/characters/${characterId}/hp`, jsonBody({ operations }), "Failed to apply HP operations");
  return { character: character as Character, concentrationChecks };
}

export async function deleteCharacter(id: string): Promise<void> {
  await send(`/characters/${id}`, { method: "DELETE" }, `Failed to delete character ${id}`);
}

// ── Journal CRUD ─────────────────────────────────────────────────────────────
// Plain REST (no transaction/op batching) — journal entries carry no mechanical
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

export async function createCharacter(input: CreateCharacterInput): Promise<Character> {
  return request<Character>("/characters", jsonBody(input), "Failed to create character");
}

// Applies a batch of XP operations (award/set) via the intent-bearing
// endpoint that logs events and auto-reverses HP on level-down.
//
// `sessionId` (optional) tags the resulting events to a SPECIFIC session
// instead of the active one — used to retroactively award XP to a past,
// already-ended session, which also recomputes that session's stored summary
// server-side.
export async function applyExperienceOperations(
  characterId: string,
  operations: ExperienceOperation[],
  sessionId?: string,
): Promise<Character> {
  return request<Character>(
    `/characters/${characterId}/experience`,
    jsonBody(sessionId ? { operations, sessionId } : { operations }),
    "Failed to apply XP operations",
  );
}

// Fetches the unified activity timeline — all events across all domains in
// one chronological stream, newest-first. Optional params:
//   category — filter to one domain (inventory|hitPoints|experience|currency)
//   type — filter to one event type (e.g. sold, damage, castSpell)
//   sessionId — filter to events recorded during one play session
//   entityId — filter to events for one entity (e.g. one InventoryItem id)
//   includeFields — when true, include per-field diff rows on each event
// type/sessionId/entityId compose with category via AND server-side.
export async function fetchActivity(
  characterId: string,
  opts?: { category?: string; type?: string; sessionId?: string; entityId?: string; includeFields?: boolean },
  signal?: AbortSignal,
): Promise<CharacterEvent[]> {
  const params = new URLSearchParams();
  if (opts?.category) params.set("category", opts.category);
  if (opts?.type) params.set("type", opts.type);
  if (opts?.sessionId) params.set("sessionId", opts.sessionId);
  if (opts?.entityId) params.set("entityId", opts.entityId);
  if (opts?.includeFields) params.set("includeFields", "1");
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<CharacterEvent[]>(
    `/characters/${characterId}/activity${query}`,
    { signal },
    "Failed to fetch activity",
  );
}

// Feeds the class-features section's "learn a maneuver" picker. Ordered
// alphabetically server-side; no client-side re-sort needed.
export async function fetchManeuvers(): Promise<CatalogManeuver[]> {
  return request<CatalogManeuver[]>("/maneuvers", undefined, "Failed to fetch maneuver catalog");
}

// Casts a known maneuver: the server spends one superiority die, rolls it, and
// returns the updated Character plus per-op { roll, saveDc } so the caller folds
// the die into the attack/damage total (or reads the announced DC).
export async function castManeuverTransaction(
  characterId: string,
  operations: ManeuverOperation[],
): Promise<{ character: Character; results: ManeuverCastResult[] }> {
  return request<{ character: Character; results: ManeuverCastResult[] }>(
    `/characters/${characterId}/maneuvers/transactions`,
    jsonBody({ operations }),
    "Failed to cast maneuver",
  );
}

// Applies a batch of resource operations atomically (spend/restore resource
// pools, learn/forget maneuvers). Full updated Character returned on success.
export async function applyResourceTransactions(
  characterId: string,
  operations: ResourceOperation[]
): Promise<Character> {
  return postTransactions(characterId, "resources", operations, "Failed to apply resource operations");
}

// Applies a batch of condition operations atomically (apply/remove a status
// condition, set exhaustion level). Full updated Character returned on success.
export async function applyConditionTransactions(
  characterId: string,
  operations: ConditionOperation[]
): Promise<Character> {
  return postTransactions(characterId, "conditions", operations, "Failed to apply condition operations");
}

// Applies class-level mutations (today: setSubclass). Returns the updated character.
export async function applyClassTransactions(
  characterId: string,
  operations: ClassOperation[]
): Promise<Character> {
  return postTransactions(characterId, "class", operations, "Failed to apply class operations");
}

// Feeds the advancement section's feat picker — same role as fetchManeuvers.
// Ordered alphabetically server-side.
export async function fetchFeats(): Promise<CatalogFeat[]> {
  return request<CatalogFeat[]>("/feats", undefined, "Failed to fetch feat catalog");
}

// Applies advancement operations (takeAsi / takeFeat / removeAdvancement).
// Returns the full updated Character on success.
export async function applyAdvancementTransactions(
  characterId: string,
  operations: AdvancementOperation[]
): Promise<Character> {
  return postTransactions(characterId, "advancement", operations, "Failed to apply advancement operations");
}

// Reverts the most-recent non-reverted batch (LIFO undo). Returns the updated
// character if the revert succeeds, or throws with a human-readable message
// (409 if the batch isn't the most recent, or it's already reverted).
export async function revertBatch(
  characterId: string,
  batchId: string
): Promise<Character> {
  return request<Character>(
    `/characters/${characterId}/events/${encodeURIComponent(batchId)}/revert`,
    { method: "POST" },
    "Failed to revert batch",
  );
}

// ── Actions ───────────────────────────────────────────────────────────────────

// Applies a batch of action operations atomically via the Phase-C orchestrator:
// each action's effect function (spend resource, consume item, heal, etc.) runs
// in a single Prisma transaction with a shared batchId, so "drink potion" is
// atomic and LIFO-undoable. Rolls (e.g. a potion's healing) are client-computed
// and passed as `op.roll`; the server validates and records but does not re-roll.
// batchId rides alongside the character (#758) so turn undo can revert this exact
// batch server-side before restoring the local economy slot.
export async function applyActionTransactions(
  characterId: string,
  operations: ActionOperation[]
): Promise<Character & { batchId?: string }> {
  return request<Character & { batchId?: string }>(
    `/characters/${characterId}/actions/transactions`,
    jsonBody({ operations }),
    "Failed to apply action operations",
  );
}

// ── Campaigns (#246) ──────────────────────────────────────────────────────────
// Plain REST: list/create/join/attach. The attach call returns the full updated
// Character (same shape as every character-mutating endpoint).

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

// ── Campaign entities & @-tagging (#248) ───────────────────────────────────────
// Plain REST. Search/list is campaign-scoped; create/edit are any-member; delete
// is OWNER-only (server-enforced). Backlinks come pre-filtered to the caller's
// own notes (private-by-default), so no client-side visibility logic is needed.

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

// Consumed by the Codex browse/detail slices of #837 (built after this API slice).
// fallow-ignore-next-line unused-export
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

// fallow-ignore-next-line unused-export
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

// ── Entity identity merges (#387) ─────────────────────────────────────────────
// Owner-only writes (prepare/execute/unmerge). The list is scrubbed server-side:
// a non-owner only ever receives EXECUTED merges between revealed identities.

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

// ── Campaign items (#380) ───────────────────────────────────────────────────────
// Owner-only CRUD (list/create/update/delete). fetchCampaignItemByEntity is the
// member-readable Codex read, keyed by the fronting entity — non-owners get it
// only when that entity is revealed, and never see dmNotes (scrubbed server-side).

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

// ── Sessions ──────────────────────────────────────────────────────────────────

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

/** Get the currently-active session, or null if none is active. */
export async function fetchActiveSession(characterId: string): Promise<Session | null> {
  // 200 with null body when no session is active.
  return request<Session | null>(
    `/characters/${characterId}/sessions/active`,
    undefined,
    "Failed to fetch active session",
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
