/**
 * The live-Combat panel's async lifecycle (#960): owner check + End-Session
 * (guarded XP award) + Leave. Unlike the old `useSessionLifecycle` (the
 * `/session` page's, which `navigate()`s back to the sheet), this one is
 * workspace-native — End/Leave call `LiveSessionProvider.refresh()` so the
 * Combat tab reverts to the static panel underneath with no navigation, and the
 * recap survives the panel unmounting because `endedSession` lives in the
 * provider, not here (#960 decision 5 / addendum D). Shares the End/Leave/owner
 * primitives with `useSessionLifecycle` via `sessionLifecycleHelpers`.
 */

import {
  leaveAndClearTurnState,
  useEndSessionFlow,
  usePendingAction,
} from "@/features/session/sessionLifecycleHelpers";
import type { LiveSessionValue } from "@/features/session/LiveSessionProvider";
import type { Character, Session } from "@/types/character";

export function useCombatLifecycle({
  character,
  session,
  onUpdate,
  live,
}: {
  character: Character;
  // Nullable so the hook can be lifted to the workspace above the join guard
  // (#979): the Leave/End affordances only surface while live+joined, so the
  // handlers below never fire with a null session.
  session: Session | null;
  onUpdate: (c: Character) => void;
  live: Pick<LiveSessionValue, "refresh" | "setEndedSession" | "bumpLog">;
}) {
  const end = usePendingAction();
  const leave = usePendingAction();
  const endFlow = useEndSessionFlow(character.id, session, end);

  function handleCharacterUpdate(updated: Character) {
    onUpdate(updated);
    live.bumpLog();
  }

  const handleConfirmEnd = (xpAmount: number) =>
    endFlow.confirmEnd(xpAmount, async (ended) => {
      live.setEndedSession(ended); // Recap survives this panel unmounting.
      await live.refresh(); // Combat reverts to the static panel underneath.
    });

  const handleLeave = () =>
    leave.run(async () => {
      if (!session) return;
      await leaveAndClearTurnState(session, character.id);
      await live.refresh(); // No navigate() — we're already in the workspace.
    }, "Failed to leave the session. Please try again.");

  return {
    endPending: end.pending,
    endError: end.error,
    endPromptOpen: endFlow.endPromptOpen,
    leavePending: leave.pending,
    leaveError: leave.error,
    /** A leave or end is in flight — disables the header's Leave/End affordances. */
    sessionActionBusy: end.pending || leave.pending,
    openEndPrompt: endFlow.openEndPrompt,
    closeEndPrompt: endFlow.closeEndPrompt,
    handleCharacterUpdate,
    handleConfirmEnd,
    handleLeave,
  };
}
