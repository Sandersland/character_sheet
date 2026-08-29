// endedSession lives in LiveSessionProvider, not here, so the recap survives this panel unmounting.
// Character updates flow through useCurrentCharacter/useCharacterMutation directly; session-log bumps happen via useSessionLogBumpOnCharacterWrite, not here.

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
  live,
}: {
  character: Character;
  // Nullable so the hook can be lifted above the join guard — Leave/End only surface while live+joined, so the handlers below never actually fire with a null session.
  session: Session | null;
  live: Pick<LiveSessionValue, "refresh" | "setEndedSession">;
}) {
  const end = usePendingAction();
  const leave = usePendingAction();
  const endFlow = useEndSessionFlow(character.id, session, end);

  const handleConfirmEnd = (xpAmount: number) =>
    endFlow.confirmEnd(xpAmount, async (ended) => {
      live.setEndedSession(ended);
      await live.refresh();
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
    /** A failed Leave surfaces here as a dismissible toast (End errors show in the prompt instead). */
    leaveError: leave.error,
    dismissLeaveError: () => leave.setError(null),
    sessionActionBusy: end.pending || leave.pending,
    /** Leaving is campaign-only — a solo session has no party to leave, so the header hides Leave while keeping End. */
    canLeave: session !== null && session.campaignId !== null,
    openEndPrompt: endFlow.openEndPrompt,
    closeEndPrompt: endFlow.closeEndPrompt,
    handleConfirmEnd,
    handleLeave,
  };
}
