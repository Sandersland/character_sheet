import type { Character, InventoryOperation } from "@/types/character";
import { postTransactions } from "@/api/http";

// One inline edit is a batch of one operation; a bulk action (e.g. selling
// several stacks at once) is a batch of several — see backend
// applyInventoryOperations for the atomicity/ledger semantics.
export async function applyInventoryTransactions(
  characterId: string,
  operations: InventoryOperation[]
): Promise<Character> {
  return postTransactions(characterId, "inventory", operations, "Failed to apply inventory transactions");
}
