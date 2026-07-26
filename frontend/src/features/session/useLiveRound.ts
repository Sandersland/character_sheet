import { useLiveSession } from "@/features/session/LiveSessionProvider";
import { useTurnStateContext } from "@/features/session/TurnStateProvider";

/**
 * The single source of truth for "what round is it" across the workspace (#959).
 *
 * Both numbers trace back to the same server column (Session.round, #1030) —
 * this just picks the fresher read. The mounted tracker is kept current by
 * useCombatPoll's ~5s sync (plus an immediate sync after this client's own
 * combat/start|end|round calls) while joined; `doorway.session.round` only
 * refreshes on the doorway's own cadence (join, window focus, explicit
 * refresh()). Not-joined callers have no tracker, so the doorway round is the
 * only read. Every strip/banner MUST read this — never read `doorway.round`
 * directly while joined.
 *
 * Returns null when there is no active round to show (not in combat / no session).
 */
export function useLiveRound(): number | null {
  const turn = useTurnStateContext();
  const { doorway } = useLiveSession();
  if (turn) return turn.inCombat ? turn.round : null; // joined: local truth
  return doorway?.session?.round ?? null; // not joined: server-derived
}
