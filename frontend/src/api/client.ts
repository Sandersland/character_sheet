import type {
  ActionOperation,
  AdvancementOperation,
  Campaign,
  CatalogAction,
  CatalogFeat,
  CatalogManeuver,
  CatalogSpell,
  Character,
  CharacterEvent,
  ConcentrationCheck,
  CharacterSummary,
  ClassOperation,
  ConditionOperation,
  CreateCharacterInput,
  ExperienceOperation,
  HitPointOperation,
  InventoryOperation,
  Item,
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

// ── Auth ────────────────────────────────────────────────────────────────────

// The enabled sign-in providers — drives the login screen's buttons (data-driven
// so adding a provider server-side needs no frontend change). Public endpoint.
export async function fetchAuthProviders(): Promise<AuthProviderInfo[]> {
  const response = await apiFetch(`${API_URL}/auth/providers`);
  if (!response.ok) {
    throw new Error(`Failed to fetch auth providers (${response.status})`);
  }
  const data = (await response.json()) as { providers: AuthProviderInfo[] };
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
  const response = await apiFetch(`${API_URL}/auth/logout`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`Failed to log out (${response.status})`);
  }
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
  const response = await apiFetch(`${API_URL}/characters`);
  if (!response.ok) {
    throw new Error(`Failed to fetch characters (${response.status})`);
  }
  return response.json();
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
  const response = await apiFetch(`${API_URL}/characters/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw new Error(`Failed to update character ${id} (${response.status})`);
  }
  return response.json();
}

export async function fetchReference(): Promise<ReferenceData> {
  const response = await apiFetch(`${API_URL}/reference`);
  if (!response.ok) {
    throw new Error(`Failed to fetch reference data (${response.status})`);
  }
  return response.json();
}

// Feeds the inventory editor's "add from catalog" picker (Phase B).
export async function fetchItems(): Promise<Item[]> {
  const response = await apiFetch(`${API_URL}/items`);
  if (!response.ok) {
    throw new Error(`Failed to fetch items (${response.status})`);
  }
  return response.json();
}

// Feeds the spellcasting section's "learn from catalog" picker.
// Ordered by level then name server-side; no client-side re-sort needed.
export async function fetchSpells(): Promise<CatalogSpell[]> {
  const response = await apiFetch(`${API_URL}/spells`);
  if (!response.ok) {
    throw new Error(`Failed to fetch spell catalog (${response.status})`);
  }
  return response.json();
}

// Applies a batch of spellcasting operations atomically: cast, expend/restore
// slots, learn/forget spells, prepare/unprepare. Mirrors applyInventoryTransactions
// — same intent-bearing batch pattern, full updated Character returned on success.
export async function applySpellcastingTransactions(
  characterId: string,
  operations: SpellcastingOperation[]
): Promise<Character> {
  const response = await apiFetch(`${API_URL}/characters/${characterId}/spellcasting/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to apply spellcasting operations (${response.status})`);
  }
  return response.json();
}

// One inline edit is a batch of one operation; a bulk action (e.g. selling
// several stacks at once) is a batch of several — see backend's
// lib/inventory.ts for the atomicity/ledger semantics.
export async function applyInventoryTransactions(
  characterId: string,
  operations: InventoryOperation[]
): Promise<Character> {
  const response = await apiFetch(`${API_URL}/characters/${characterId}/inventory/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to apply inventory transactions (${response.status})`);
  }
  return response.json();
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
  const response = await apiFetch(`${API_URL}/characters/${characterId}/hp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to apply HP operations (${response.status})`);
  }
  const { concentrationChecks = [], ...character } = (await response.json()) as Character & {
    concentrationChecks?: ConcentrationCheck[];
  };
  return { character: character as Character, concentrationChecks };
}

export async function deleteCharacter(id: string): Promise<void> {
  const response = await apiFetch(`${API_URL}/characters/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`Failed to delete character ${id} (${response.status})`);
  }
}

// ── Journal CRUD ─────────────────────────────────────────────────────────────
// Plain REST (no transaction/op batching) — journal entries carry no mechanical
// effect, so they aren't routed through the audit log. Each call returns the
// full updated Character so the caller can swap its state in one assignment.

export async function createJournalEntry(
  characterId: string,
  entry: { title: string; date: string; body: string; sessionId?: string }
): Promise<Character> {
  const response = await apiFetch(`${API_URL}/characters/${characterId}/journal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to create journal entry (${response.status})`);
  }
  return response.json();
}

export async function updateJournalEntry(
  characterId: string,
  entryId: string,
  patch: { title?: string; date?: string; body?: string }
): Promise<Character> {
  const response = await apiFetch(`${API_URL}/characters/${characterId}/journal/${entryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to update journal entry (${response.status})`);
  }
  return response.json();
}

export async function deleteJournalEntry(
  characterId: string,
  entryId: string
): Promise<Character> {
  const response = await apiFetch(`${API_URL}/characters/${characterId}/journal/${entryId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to delete journal entry (${response.status})`);
  }
  return response.json();
}

export async function createCharacter(input: CreateCharacterInput): Promise<Character> {
  const response = await apiFetch(`${API_URL}/characters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Failed to create character (${response.status})`);
  }
  return response.json();
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
  const response = await apiFetch(`${API_URL}/characters/${characterId}/experience`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sessionId ? { operations, sessionId } : { operations }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to apply XP operations (${response.status})`);
  }
  return response.json();
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
  const response = await apiFetch(`${API_URL}/characters/${characterId}/activity${query}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch activity (${response.status})`);
  }
  return response.json();
}

// Feeds the class-features section's "learn a maneuver" picker. Ordered
// alphabetically server-side; no client-side re-sort needed.
export async function fetchManeuvers(): Promise<CatalogManeuver[]> {
  const response = await apiFetch(`${API_URL}/maneuvers`);
  if (!response.ok) {
    throw new Error(`Failed to fetch maneuver catalog (${response.status})`);
  }
  return response.json();
}

// Applies a batch of resource operations atomically (spend/restore resource
// pools, learn/forget maneuvers). Full updated Character returned on success.
export async function applyResourceTransactions(
  characterId: string,
  operations: ResourceOperation[]
): Promise<Character> {
  const response = await apiFetch(`${API_URL}/characters/${characterId}/resources/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to apply resource operations (${response.status})`);
  }
  return response.json();
}

// Applies a batch of condition operations atomically (apply/remove a status
// condition, set exhaustion level). Full updated Character returned on success.
export async function applyConditionTransactions(
  characterId: string,
  operations: ConditionOperation[]
): Promise<Character> {
  const response = await apiFetch(`${API_URL}/characters/${characterId}/conditions/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to apply condition operations (${response.status})`);
  }
  return response.json();
}

// Applies class-level mutations (today: setSubclass). Returns the updated character.
export async function applyClassTransactions(
  characterId: string,
  operations: ClassOperation[]
): Promise<Character> {
  const response = await apiFetch(`${API_URL}/characters/${characterId}/class/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to apply class operations (${response.status})`);
  }
  return response.json();
}

// Feeds the advancement section's feat picker — same role as fetchManeuvers.
// Ordered alphabetically server-side.
export async function fetchFeats(): Promise<CatalogFeat[]> {
  const response = await apiFetch(`${API_URL}/feats`);
  if (!response.ok) {
    throw new Error(`Failed to fetch feat catalog (${response.status})`);
  }
  return response.json();
}

// Applies advancement operations (takeAsi / takeFeat / removeAdvancement).
// Returns the full updated Character on success.
export async function applyAdvancementTransactions(
  characterId: string,
  operations: AdvancementOperation[]
): Promise<Character> {
  const response = await apiFetch(`${API_URL}/characters/${characterId}/advancement/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to apply advancement operations (${response.status})`);
  }
  return response.json();
}

// Reverts the most-recent non-reverted batch (LIFO undo). Returns the updated
// character if the revert succeeds, or throws with a human-readable message
// (409 if the batch isn't the most recent, or it's already reverted).
export async function revertBatch(
  characterId: string,
  batchId: string
): Promise<Character> {
  const response = await apiFetch(
    `${API_URL}/characters/${characterId}/events/${encodeURIComponent(batchId)}/revert`,
    { method: "POST" }
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to revert batch (${response.status})`);
  }
  return response.json();
}

// ── Actions ───────────────────────────────────────────────────────────────────

// Feeds the TurnTracker's action catalog picker. Ordered by cost then name.
export async function fetchActions(): Promise<CatalogAction[]> {
  const response = await apiFetch(`${API_URL}/actions`);
  if (!response.ok) {
    throw new Error(`Failed to fetch action catalog (${response.status})`);
  }
  return response.json();
}

// Applies a batch of action operations atomically via the Phase-C orchestrator:
// each action's effect function (spend resource, consume item, heal, etc.) runs
// in a single Prisma transaction with a shared batchId, so "drink potion" is
// atomic and LIFO-undoable. Rolls (e.g. a potion's healing) are client-computed
// and passed as `op.roll`; the server validates and records but does not re-roll.
export async function applyActionTransactions(
  characterId: string,
  operations: ActionOperation[]
): Promise<Character> {
  const response = await apiFetch(`${API_URL}/characters/${characterId}/actions/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to apply action operations (${response.status})`);
  }
  return response.json();
}

// ── Campaigns (#246) ──────────────────────────────────────────────────────────
// Plain REST: list/create/join/attach. The attach call returns the full updated
// Character (same shape as every character-mutating endpoint).

export async function fetchCampaigns(): Promise<Campaign[]> {
  const response = await apiFetch(`${API_URL}/campaigns`);
  if (!response.ok) {
    throw new Error(`Failed to fetch campaigns (${response.status})`);
  }
  return response.json();
}

export async function createCampaign(name: string): Promise<Campaign> {
  const response = await apiFetch(`${API_URL}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to create campaign (${response.status})`);
  }
  return response.json();
}

export async function fetchCampaign(id: string): Promise<Campaign> {
  const response = await apiFetch(`${API_URL}/campaigns/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch campaign ${id} (${response.status})`);
  }
  return response.json();
}

export async function joinCampaign(inviteCode: string): Promise<Campaign> {
  const response = await apiFetch(`${API_URL}/campaigns/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviteCode }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to join campaign (${response.status})`);
  }
  return response.json();
}

export async function addCharacterToCampaign(
  characterId: string,
  campaignId: string,
): Promise<Character> {
  const response = await apiFetch(`${API_URL}/campaigns/${campaignId}/characters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to add character to campaign (${response.status})`);
  }
  return response.json();
}

// ── Sessions ──────────────────────────────────────────────────────────────────

/** Start a new play session. Rejects (throws) if one is already active. */
export async function startSession(
  characterId: string,
  title?: string,
): Promise<{ session: Session; character: Character }> {
  const response = await apiFetch(`${API_URL}/characters/${characterId}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to start session (${response.status})`);
  }
  return response.json();
}

/** End a play session by id. */
export async function endSession(
  characterId: string,
  sessionId: string,
): Promise<{ session: Session }> {
  const response = await apiFetch(
    `${API_URL}/characters/${characterId}/sessions/${sessionId}/end`,
    { method: "POST" },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to end session (${response.status})`);
  }
  return response.json();
}

/** List all sessions for a character (newest first). */
export async function fetchSessions(characterId: string): Promise<Session[]> {
  const response = await apiFetch(`${API_URL}/characters/${characterId}/sessions`);
  if (!response.ok) throw new Error(`Failed to fetch sessions (${response.status})`);
  return response.json();
}

/** Get the currently-active session, or null if none is active. */
export async function fetchActiveSession(characterId: string): Promise<Session | null> {
  const response = await apiFetch(`${API_URL}/characters/${characterId}/sessions/active`);
  if (!response.ok) throw new Error(`Failed to fetch active session (${response.status})`);
  return response.json(); // 200 with null body when no session is active
}

/** Get one session with its events. */
export async function fetchSession(
  characterId: string,
  sessionId: string,
): Promise<Session & { events: CharacterEvent[] }> {
  const response = await apiFetch(`${API_URL}/characters/${characterId}/sessions/${sessionId}`);
  if (!response.ok) throw new Error(`Failed to fetch session (${response.status})`);
  return response.json();
}

/** Log a "combat started" event against the active session. */
export async function startCombat(
  characterId: string,
  sessionId: string,
): Promise<void> {
  const response = await apiFetch(
    `${API_URL}/characters/${characterId}/sessions/${sessionId}/combat/start`,
    { method: "POST" },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to start combat (${response.status})`);
  }
}

/** Log a "combat ended" event against the active session. */
export async function endCombat(
  characterId: string,
  sessionId: string,
): Promise<void> {
  const response = await apiFetch(
    `${API_URL}/characters/${characterId}/sessions/${sessionId}/combat/end`,
    { method: "POST" },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to end combat (${response.status})`);
  }
}

/** Log a "combat round advanced" event against the active session. */
export async function advanceCombatRound(
  characterId: string,
  sessionId: string,
  round: number,
): Promise<void> {
  const response = await apiFetch(
    `${API_URL}/characters/${characterId}/sessions/${sessionId}/combat/round`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round }),
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to advance combat round (${response.status})`);
  }
}

/** Log a single attack or damage roll from the session UI. Best-effort — callers catch and console.error. */
export async function logRoll(
  characterId: string,
  sessionId: string,
  payload: {
    kind: "attack" | "damage";
    source: string;
    total: number;
    specLabel?: string;
    damageType?: string;
    /** Raw kept die faces (non-dropped) so the Session Log can show the breakdown. */
    faces?: number[];
  },
): Promise<void> {
  const response = await apiFetch(
    `${API_URL}/characters/${characterId}/sessions/${sessionId}/roll`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to log roll (${response.status})`);
  }
}
