/**
 * The live-session End/Leave lifecycle (#960), lifted to `CharacterSheetWorkspace`
 * so the sheet header can drive it (#979). Workspace-native — End/Leave call
 * `LiveSessionProvider.refresh()` so the Combat tab reverts to the static panel
 * underneath with no navigation, and the recap survives the panel unmounting
 * because `endedSession` lives in the provider, not here (#960 decision 5 /
 * addendum D). Built from the shared `sessionLifecycleHelpers` primitives.
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
    /** A failed Leave surfaces here (End errors show in the prompt); the workspace
     *  renders it as a dismissible toast, since Leave has no modal of its own. */
    leaveError: leave.error,
    dismissLeaveError: () => leave.setError(null),
    /** A leave or end is in flight — disables the header's Leave/End affordances. */
    sessionActionBusy: end.pending || leave.pending,
    /** Leaving is campaign-only: a solo session (campaignId null, #1082) has no
     *  party to leave, so the header hides Leave while keeping End. */
    canLeave: session !== null && session.campaignId !== null,
    openEndPrompt: endFlow.openEndPrompt,
    closeEndPrompt: endFlow.closeEndPrompt,
    handleCharacterUpdate,
    handleConfirmEnd,
    handleLeave,
  };
}
