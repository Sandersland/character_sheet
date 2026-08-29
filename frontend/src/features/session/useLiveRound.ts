import { useLiveSession } from "@/features/session/LiveSessionProvider";
import { useTurnStateContext } from "@/features/session/TurnStateProvider";

/**
 * Single source of truth for the current round (#959) — read this, never `doorway.round` directly, while joined.
 */
export function useLiveRound(): number | null {
  const turn = useTurnStateContext();
  const { doorway } = useLiveSession();
  if (turn) return turn.inCombat ? turn.round : null;
  return doorway?.session?.round ?? null;
}
