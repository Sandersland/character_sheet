import type { Character, SpellcastingOperation } from "@/types/character";
import { postTransactions } from "@/api/http";

// Applies a batch of spellcasting operations atomically: cast, expend/restore
// slots, learn/forget spells, prepare/unprepare. Mirrors applyInventoryTransactions
// — same intent-bearing batch pattern, full updated Character returned on success.
export async function applySpellcastingTransactions(
  characterId: string,
  operations: SpellcastingOperation[]
): Promise<Character> {
  return postTransactions(characterId, "spellcasting", operations, "Failed to apply spellcasting operations");
}
