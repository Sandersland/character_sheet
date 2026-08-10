import { useCallback } from "react";

import { useTurnStateContext } from "@/features/session/TurnStateProvider";

/**
 * Wrap a turn-undo so it re-reads combat state once the revert resolves (#1439
 * review): undoing a spell cast lifts the interlock that cast recorded
 * server-side (revertCombatEvent clears the SessionParticipant field), and the
 * block must not linger in the picker until the next ~5s poll. Kept as its own
 * hook so the wiring stays out of the already-large TurnHub / useTurnActions.
 */
export function useUndoWithCombatRefresh(handleUndo: () => Promise<void>): () => Promise<void> {
  const refreshCombat = useTurnStateContext()?.refreshCombat;
  return useCallback(async () => {
    await handleUndo();
    await refreshCombat?.();
  }, [handleUndo, refreshCombat]);
}
