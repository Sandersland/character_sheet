import { useCallback } from "react";

import { useTurnStateContext } from "@/features/session/TurnStateProvider";

/** Re-reads combat state after undo so a lifted spell-cast interlock (revertCombatEvent clears SessionParticipant) doesn't linger until the next ~5s poll. */
export function useUndoWithCombatRefresh(handleUndo: () => Promise<void>): () => Promise<void> {
  const refreshCombat = useTurnStateContext()?.refreshCombat;
  return useCallback(async () => {
    await handleUndo();
    await refreshCombat?.();
  }, [handleUndo, refreshCombat]);
}
