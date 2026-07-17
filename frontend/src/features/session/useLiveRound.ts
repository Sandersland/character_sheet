import { useLiveSession } from "@/features/session/LiveSessionProvider";
import { useTurnStateContext } from "@/features/session/TurnStateProvider";

/**
 * The single source of truth for "what round is it" across the workspace (#959).
 *
 * Two rounds exist: `TurnState.round` (local, authoritative while YOU are in the
 * fight) and `doorway.session.round` (server-derived from `combatRoundAdvanced`,
 * frozen at fetch time). Rule: the mounted tracker wins; the doorway round only
 * covers the not-joined preview. Every strip/banner MUST read this — never read
 * `doorway.round` directly while joined.
 *
 * Returns null when there is no active round to show (not in combat / no session).
 */
export function useLiveRound(): number | null {
  const turn = useTurnStateContext();
  const { doorway } = useLiveSession();
  if (turn) return turn.inCombat ? turn.round : null; // joined: local truth
  return doorway?.session?.round ?? null; // not joined: server-derived
}
