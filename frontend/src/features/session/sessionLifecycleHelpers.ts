/**
 * Session-lifecycle primitives (#960) behind the workspace `useCombatLifecycle`:
 * the pending/error wrapper, the leave call, and the End-Session confirm flow
 * (guarded XP award → end). Once shared with the `/session` page's lifecycle;
 * that host was retired in #962, leaving `useCombatLifecycle` the sole consumer.
 */

import { useCallback, useRef, useState, type MutableRefObject } from "react";

import { applyExperienceOperations, endSession, endSoloSession, leaveSession } from "@/api/client";
import { clearTurnState } from "@/features/session/turnStatePersistence";
import { errorMessage } from "@/lib/errorMessage";
import type { Session } from "@/types/character";

/**
 * The pending/error state + try-catch wrapper both lifecycle hooks share for an
 * async lifecycle action (End, Leave). `run(fn, fallback)` flips `pending`,
 * clears the error, runs `fn`, and surfaces a message on failure.
 */
export function usePendingAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<void>, fallbackMsg: string) => {
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err, fallbackMsg));
    } finally {
      setPending(false);
    }
  }, []);
  return { pending, error, setError, run };
}

/**
 * Award end-of-session XP (guarded against a double-award on retry via
 * `awardedRef`) while the session is still active — so it's auto-tagged with
 * this sessionId → recap `xpGained` — then clear the local turn state and end
 * the session. Returns the ended `Session` (with its recap summary).
 */
async function awardXpThenEndSession(
  characterId: string,
  session: Session,
  xpAmount: number,
  awardedRef: MutableRefObject<boolean>,
): Promise<Session> {
  if (xpAmount > 0 && !awardedRef.current) {
    await applyExperienceOperations(characterId, [{ type: "award", amount: xpAmount }]);
    awardedRef.current = true;
  }
  clearTurnState(session.id);
  // A solo session (campaignId null, #1082) ends through the character-scoped
  // route; a campaign session through the campaign route.
  const { session: ended } =
    session.campaignId === null
      ? await endSoloSession(characterId, session.id)
      : await endSession(session.campaignId, session.id);
  return ended;
}

/** Leave the campaign session and drop this browser's local turn state for it.
 *  Leaving is campaign-only — a solo session has no party to leave behind — so a
 *  null campaignId fails loud rather than silently no-op, in case a future
 *  refactor re-exposes Leave for solo (the UI gates it out via canLeave). */
export async function leaveAndClearTurnState(session: Session, characterId: string): Promise<void> {
  if (session.campaignId === null) throw new Error("Cannot leave a solo (campaign-less) session");
  await leaveSession(session.campaignId, session.id, characterId);
  clearTurnState(session.id);
}

/**
 * The End-Session prompt + confirm flow. Owns the prompt open-state and the
 * XP-award-then-end call (guarded); the caller supplies `onEnded` (the workspace
 * stashes the recap in the provider + refreshes). Once shared with the retired
 * `/session` host's lifecycle; `useCombatLifecycle` is the sole consumer now.
 */
export function useEndSessionFlow(
  characterId: string,
  // Nullable so the flow can be lifted above the join guard (#979) — the prompt
  // is only openable while a session is live+joined, so confirmEnd never runs
  // with a null session, but the hook itself must call unconditionally.
  session: Session | null,
  end: ReturnType<typeof usePendingAction>,
) {
  const [endPromptOpen, setEndPromptOpen] = useState(false);
  const awardedRef = useRef(false);

  return {
    endPromptOpen,
    openEndPrompt: () => {
      awardedRef.current = false;
      end.setError(null);
      setEndPromptOpen(true);
    },
    closeEndPrompt: () => {
      end.setError(null);
      setEndPromptOpen(false);
    },
    confirmEnd: (xpAmount: number, onEnded: (ended: Session) => void | Promise<void>) =>
      end.run(async () => {
        if (!session) return;
        const ended = await awardXpThenEndSession(characterId, session, xpAmount, awardedRef);
        setEndPromptOpen(false);
        await onEnded(ended);
      }, "Failed to end the session. Please try again."),
  };
}
