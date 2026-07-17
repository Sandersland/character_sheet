/**
 * Shared session-lifecycle primitives (#960) used by both the `/session` page's
 * `useSessionLifecycle` and the workspace `useCombatLifecycle` — so the End/
 * Leave/owner logic lives once, not cloned across the two hosts.
 */

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import { applyExperienceOperations, endSession, fetchCampaign, leaveSession } from "@/api/client";
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

/** True once the viewer is confirmed the campaign OWNER (gates the Loot tab). */
export function useIsSessionOwner(campaignId: string): boolean {
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchCampaign(campaignId)
      .then((c) => {
        if (!cancelled) setIsOwner(c.role === "OWNER");
      })
      .catch(() => {
        /* non-owners simply never see the Loot tab */
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);
  return isOwner;
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
  const { session: ended } = await endSession(session.campaignId, session.id);
  return ended;
}

/** Leave the session and drop this browser's local turn state for it. */
export async function leaveAndClearTurnState(session: Session, characterId: string): Promise<void> {
  await leaveSession(session.campaignId, session.id, characterId);
  clearTurnState(session.id);
}

/**
 * The End-Session prompt + confirm flow, shared by both lifecycle hooks. Owns
 * the prompt open-state and the XP-award-then-end call (guarded); the host
 * supplies `onEnded` — the only difference between the two (the `/session` page
 * stashes the recap locally; the workspace stashes it in the provider + refreshes).
 */
export function useEndSessionFlow(
  characterId: string,
  session: Session,
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
        const ended = await awardXpThenEndSession(characterId, session, xpAmount, awardedRef);
        setEndPromptOpen(false);
        await onEnded(ended);
      }, "Failed to end the session. Please try again."),
  };
}
