import type {
  ActionOperation,
  Character,
  CharacterEvent,
  CharacterSummary,
  ConcentrationCheck,
  ConditionOperation,
  CampaignPreferences,
  CreateCharacterInput,
  ExecuteActionResult,
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
  // 404 and 403 both resolve to null (the sheet's not-found screen) — a 403
  // must not reveal that the character exists. A 401 is handled globally by
  // apiFetch.
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

// The response is the serialized character plus `concentrationChecks` —
// split apart so callers get a clean Character to store and a list to
// surface (toast). Defaults to [] for older servers / non-damage ops.
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

// `sessionId` (optional) tags events to a specific session instead of the
// active one — used to retroactively award XP to an already-ended session,
// which also recomputes that session's stored summary server-side.
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

// No Content-Type header on purpose: the browser must generate the
// multipart boundary itself — setting one manually breaks the upload.
// `portraitUrl` carries a fresh ?v= version so a cached <img> refetches.
export async function uploadCharacterPortrait(id: string, file: File): Promise<Character> {
  const form = new FormData();
  form.append("portrait", file);
  return request<Character>(
    `/characters/${id}/portrait`,
    { method: "POST", body: form },
    "Failed to upload the portrait",
  );
}

// Idempotent; the returned Character has portraitUrl absent.
export async function deleteCharacterPortrait(id: string): Promise<Character> {
  return request<Character>(
    `/characters/${id}/portrait`,
    { method: "DELETE" },
    "Failed to remove the portrait",
  );
}

export async function applyResourceTransactions(
  characterId: string,
  operations: ResourceOperation[]
): Promise<Character> {
  return postTransactions(characterId, "resources", operations, "Failed to apply resource operations");
}

// A dedicated call, not applyResourceTransactions: existing callers of that
// one expect a bare Character, so `results` rides alongside here instead
// (mirrors castManeuverTransaction).
export async function rollInitiativeTransaction(
  characterId: string,
): Promise<Character & { results: ResourceOpResult[] }> {
  return request<Character & { results: ResourceOpResult[] }>(
    `/characters/${characterId}/resources/transactions`,
    jsonBody({ operations: [{ type: "rollInitiative" }] }),
    "Failed to roll initiative",
  );
}

export async function applyConditionTransactions(
  characterId: string,
  operations: ConditionOperation[]
): Promise<Character> {
  return postTransactions(characterId, "conditions", operations, "Failed to apply condition operations");
}

// Reverts the most-recent non-reverted batch (LIFO undo) — 409s if the
// batch isn't the most recent or is already reverted.
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

// Rolls (e.g. a potion's healing) are client-computed and passed as
// `op.roll`; the server validates and records but does not re-roll.
// batchId rides alongside the character so turn undo can revert this exact
// batch server-side before restoring the local economy slot.
// `results` is index-aligned 1:1 with `operations` — a row-driven cast-core
// op (Second Wind) reports its server roll there; every other op reports {}.
export async function applyActionTransactions(
  characterId: string,
  operations: ActionOperation[]
): Promise<Character & { batchId?: string; results?: ExecuteActionResult[] }> {
  return request<Character & { batchId?: string; results?: ExecuteActionResult[] }>(
    `/characters/${characterId}/actions/transactions`,
    jsonBody({ operations }),
    "Failed to apply action operations",
  );
}
