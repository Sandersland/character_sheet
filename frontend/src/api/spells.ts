import type { Character, HomebrewSpell, HomebrewSpellInput, SpellcastingOperation } from "@/types/character";
import { jsonBody, postTransactions, request, send } from "@/api/http";

// Applies a batch of spellcasting operations atomically: cast, expend/restore
// slots, learn/forget spells, prepare/unprepare. Mirrors applyInventoryTransactions
// — same intent-bearing batch pattern, full updated Character returned on success.
export async function applySpellcastingTransactions(
  characterId: string,
  operations: SpellcastingOperation[]
): Promise<Character> {
  return postTransactions(characterId, "spellcasting", operations, "Failed to apply spellcasting operations");
}

// User-owned homebrew spell CRUD (#1787, epic #1782 4/5) — plain REST against
// custom-spells.ts, same shape as createCampaignItem/updateCampaignItem/
// deleteCampaignItem in api/campaign.ts. Not a `…/transactions` batch: a
// homebrew spell is reusable catalog content shared across all of the
// caller's characters, never one character's mutable state (see
// custom-spells.ts's own file banner). PATCH is a full-field replace, not a
// partial merge — same customSpellSchema-derived body as POST.

export async function createCustomSpell(input: HomebrewSpellInput): Promise<HomebrewSpell> {
  return request<HomebrewSpell>("/spells/custom", jsonBody(input), "Failed to create custom spell");
}

export async function updateCustomSpell(id: string, input: HomebrewSpellInput): Promise<HomebrewSpell> {
  return request<HomebrewSpell>(`/spells/custom/${id}`, jsonBody(input, "PATCH"), "Failed to update custom spell");
}

export async function deleteCustomSpell(id: string): Promise<void> {
  await send(`/spells/custom/${id}`, { method: "DELETE" }, "Failed to delete custom spell");
}
