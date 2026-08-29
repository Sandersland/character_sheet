import type { Character, HomebrewSpell, HomebrewSpellInput, SpellcastingOperation } from "@/types/character";
import { jsonBody, postTransactions, request, send } from "@/api/http";

export async function applySpellcastingTransactions(
  characterId: string,
  operations: SpellcastingOperation[]
): Promise<Character> {
  return postTransactions(characterId, "spellcasting", operations, "Failed to apply spellcasting operations");
}

// Not a `…/transactions` batch: a homebrew spell is reusable catalog
// content shared across all of the caller's characters, never one
// character's mutable state. PATCH is a full-field replace, not a partial
// merge — the same customSpellSchema-derived body as POST.
//
// `characterId` names the character the homebrew is authored for; the
// server derives the new spell's rules edition from it. Edition is never
// sent in the body — the server is the authority.
export async function createCustomSpell(input: HomebrewSpellInput, characterId: string): Promise<HomebrewSpell> {
  return request<HomebrewSpell>(
    `/spells/custom?characterId=${encodeURIComponent(characterId)}`,
    jsonBody(input),
    "Failed to create custom spell",
  );
}

export async function updateCustomSpell(id: string, input: HomebrewSpellInput): Promise<HomebrewSpell> {
  return request<HomebrewSpell>(`/spells/custom/${id}`, jsonBody(input, "PATCH"), "Failed to update custom spell");
}

export async function deleteCustomSpell(id: string): Promise<void> {
  await send(`/spells/custom/${id}`, { method: "DELETE" }, "Failed to delete custom spell");
}
