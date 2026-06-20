import type {
  CatalogSpell,
  Character,
  CharacterEvent,
  CharacterSummary,
  CreateCharacterInput,
  ExperienceOperation,
  HitPointOperation,
  InventoryOperation,
  Item,
  LedgerEntry,
  ReferenceData,
  SpellcastingOperation,
} from "@/types/character";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health`);
    if (!response.ok) return false;
    const data = await response.json();
    return data.status === "ok";
  } catch {
    return false;
  }
}

export async function fetchCharacters(): Promise<CharacterSummary[]> {
  const response = await fetch(`${API_URL}/characters`);
  if (!response.ok) {
    throw new Error(`Failed to fetch characters (${response.status})`);
  }
  return response.json();
}

export async function fetchCharacter(id: string): Promise<Character | null> {
  const response = await fetch(`${API_URL}/characters/${id}`);
  if (response.status === 404) return null;
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
  const response = await fetch(`${API_URL}/characters/${id}`, {
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
  const response = await fetch(`${API_URL}/reference`);
  if (!response.ok) {
    throw new Error(`Failed to fetch reference data (${response.status})`);
  }
  return response.json();
}

// Feeds the inventory editor's "add from catalog" picker (Phase B).
export async function fetchItems(): Promise<Item[]> {
  const response = await fetch(`${API_URL}/items`);
  if (!response.ok) {
    throw new Error(`Failed to fetch items (${response.status})`);
  }
  return response.json();
}

// Feeds the spellcasting section's "learn from catalog" picker.
// Ordered by level then name server-side; no client-side re-sort needed.
export async function fetchSpells(): Promise<CatalogSpell[]> {
  const response = await fetch(`${API_URL}/spells`);
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
  const response = await fetch(`${API_URL}/characters/${characterId}/spellcasting/transactions`, {
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
  const response = await fetch(`${API_URL}/characters/${characterId}/inventory/transactions`, {
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

// The read-only ledger (Phase C) — unfiltered for the global history view,
// or scoped to one still-held row for the per-item view. Both are the same
// LedgerModal component; see its comment for why filtering only ever
// covers currently-held items.
export async function fetchLedger(characterId: string, inventoryItemId?: string): Promise<LedgerEntry[]> {
  const query = inventoryItemId ? `?inventoryItemId=${encodeURIComponent(inventoryItemId)}` : "";
  const response = await fetch(`${API_URL}/characters/${characterId}/inventory/transactions${query}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ledger (${response.status})`);
  }
  return response.json();
}

// Applies a batch of HP operations atomically (damage, heal, rest, level-up,
// death saves). Mirrors applyInventoryTransactions — same intent-bearing
// batch pattern, full updated Character returned on success.
export async function applyHitPointOperations(
  characterId: string,
  operations: HitPointOperation[]
): Promise<Character> {
  const response = await fetch(`${API_URL}/characters/${characterId}/hp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to apply HP operations (${response.status})`);
  }
  return response.json();
}

export async function deleteCharacter(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/characters/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`Failed to delete character ${id} (${response.status})`);
  }
}

export async function createCharacter(input: CreateCharacterInput): Promise<Character> {
  const response = await fetch(`${API_URL}/characters`, {
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
export async function applyExperienceOperations(
  characterId: string,
  operations: ExperienceOperation[]
): Promise<Character> {
  const response = await fetch(`${API_URL}/characters/${characterId}/experience`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
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
//   entityId — filter to events for one entity (e.g. one InventoryItem id)
//   includeFields — when true, include per-field diff rows on each event
export async function fetchActivity(
  characterId: string,
  opts?: { category?: string; entityId?: string; includeFields?: boolean }
): Promise<CharacterEvent[]> {
  const params = new URLSearchParams();
  if (opts?.category) params.set("category", opts.category);
  if (opts?.entityId) params.set("entityId", opts.entityId);
  if (opts?.includeFields) params.set("includeFields", "1");
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_URL}/characters/${characterId}/activity${query}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch activity (${response.status})`);
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
  const response = await fetch(
    `${API_URL}/characters/${characterId}/events/${encodeURIComponent(batchId)}/revert`,
    { method: "POST" }
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to revert batch (${response.status})`);
  }
  return response.json();
}
