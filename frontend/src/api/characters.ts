import type {
  ActionOperation,
  Character,
  CharacterEvent,
  CharacterSummary,
  ConcentrationCheck,
  ConditionOperation,
  CampaignPreferences,
  CreateCharacterInput,
  ExperienceOperation,
  HitPointOperation,
  ResourceOperation,
  ResourceOpResult,
} from "@/types/character";
import { apiFetch, jsonBody, postTransactions, request, send } from "@/api/http";

export async function fetchCharacters(): Promise<CharacterSummary[]> {
  return request<CharacterSummary[]>("/characters", undefined, "Failed to fetch characters");
}

export async function fetchCharacter(id: string): Promise<Character | null> {
  const response = await apiFetch(`/characters/${id}`);
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

// Applies a batch of resource operations atomically (spend/restore resource
// pools, learn/forget maneuvers). Full updated Character returned on success.
export async function applyResourceTransactions(
  characterId: string,
  operations: ResourceOperation[]
): Promise<Character> {
  return postTransactions(characterId, "resources", operations, "Failed to apply resource operations");
}

// Rolls Initiative / combat start (#1239/#1243): applies every onInitiative-
// declaring pool's regen (Monk Uncanny Metabolism's Focus refill + HP heal,
// Perfect Focus's top-up) server-side and returns the updated Character plus
// the per-op result the caller reads for its combat-start toast. A dedicated
// call (not the generic applyResourceTransactions) since existing callers of
// that one expect a bare Character; results rides alongside here the same way
// castManeuverTransaction's does.
export async function rollInitiativeTransaction(
  characterId: string,
): Promise<Character & { results: ResourceOpResult[] }> {
  return request<Character & { results: ResourceOpResult[] }>(
    `/characters/${characterId}/resources/transactions`,
    jsonBody({ operations: [{ type: "rollInitiative" }] }),
    "Failed to roll initiative",
  );
}

// Applies a batch of condition operations atomically (apply/remove a status
// condition, set exhaustion level). Full updated Character returned on success.
export async function applyConditionTransactions(
  characterId: string,
  operations: ConditionOperation[]
): Promise<Character> {
  return postTransactions(characterId, "conditions", operations, "Failed to apply condition operations");
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
