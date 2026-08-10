import type { Character } from "@/types/character";
import { postTransactions } from "@/api/http";
import type { ResolveActionEventData, RollEventData } from "@character-sheet/shared-types";

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

/**
 * The standalone-roll op (#1861) — a player-driven ability check / saving
 * throw / initiative roll, or a tally-resolve inline damage roll, committed
 * through the SAME resolve-action resolver as a weapon swing/spell cast (its
 * `logRoll` op arm) instead of the retired fire-and-forget session-roll route.
 * That makes the roll a real batched, trivially-undoable audit event. The
 * backend derives the sessionId from the caller's active session, so no
 * sessionId rides on the wire. `RollEventData` minus the RESERVED target/
 * outcome (never accepted — self-or-announce, no enemy/target model).
 */
interface LogRollOperation extends Omit<RollEventData, "target" | "outcome"> {
  type: "logRoll";
}

/**
 * Commits one standalone roll as a roll-category CharacterEvent. Returns the
 * (state-unchanged) updated Character like every transaction endpoint; callers
 * that only need the Session Log to refresh may treat it best-effort.
 */
export async function logRollAction(
  characterId: string,
  roll: Omit<RollEventData, "target" | "outcome">,
): Promise<Character> {
  const op: LogRollOperation = { type: "logRoll", ...roll };
  return postTransactions(characterId, "resolve-action", [op], "Failed to log roll");
}
