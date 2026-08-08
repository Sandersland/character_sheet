import type { Character } from "@/types/character";
import { postTransactions } from "@/api/http";
import type { ResolveActionEventData } from "@character-sheet/shared-types";

/**
 * The `resolveAction` op (epic #1827: #1829 backend, #1832 first frontend
 * caller) — `ResolveActionEventData` (shared-types, built for the #1830 feed)
 * plus the operation's literal `type` discriminant. The validating zod schema
 * stays backend-local (`backend/src/lib/combat/resolve-action-ops.ts`) —
 * mirrors `castSpellOpSchema` staying local to
 * routes/character/spellcasting.ts while its frontend caller (api/spells.ts)
 * imports a structurally-matching type, never the schema itself.
 */
export interface ResolveActionOperation extends ResolveActionEventData {
  type: "resolveAction";
}

/**
 * Commits one resolved weapon swing or spell cast as a single undoable
 * `resolveAction` CharacterEvent (epic #1827). Mirrors
 * `applySpellcastingTransactions` — POST .../resolve-action/transactions,
 * full updated Character on success.
 */
export async function applyResolveActionOperations(
  characterId: string,
  operations: ResolveActionOperation[],
): Promise<Character> {
  return postTransactions(characterId, "resolve-action", operations, "Failed to resolve action");
}
