import { useCallback, useRef, useState, type MutableRefObject } from "react";
import { useMutation } from "@tanstack/react-query";

import { applyExperienceOperations, endSession, endSoloSession, leaveSession } from "@/api/client";
import { clearTurnState } from "@/features/session/turnStatePersistence";
import { errorMessage } from "@/lib/errorMessage";
import type { Session } from "@/types/character";

// fallbackMsg stays per-call (not fixed at construction) since End and Leave share this one instance but want different copy.
export function usePendingAction() {
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({ mutationFn: (fn: () => Promise<void>) => fn() });
  // Depend on mutateAsync, not the mutation object — it's rebuilt on every transition, so depending on it would defeat useCallback's memo.
  const { mutateAsync } = mutation;

  const run = useCallback(
    async (fn: () => Promise<void>, fallbackMsg: string) => {
      setError(null);
      try {
        await mutateAsync(fn);
      } catch (err) {
        setError(errorMessage(err, fallbackMsg));
      }
    },
    [mutateAsync],
  );
  return { pending: mutation.isPending, error, setError, run };
}

// XP must be awarded while the session is still active so it's tagged into this session's recap.
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
  const { session: ended } =
    session.campaignId === null
      ? await endSoloSession(characterId, session.id)
      : await endSession(session.campaignId, session.id);
  return ended;
}

// Leaving is campaign-only; a null campaignId fails loud rather than silently no-op, in case a future refactor re-exposes Leave for solo (the UI gates it out via canLeave).
export async function leaveAndClearTurnState(session: Session, characterId: string): Promise<void> {
  if (session.campaignId === null) throw new Error("Cannot leave a solo (campaign-less) session");
  await leaveSession(session.campaignId, session.id, characterId);
  clearTurnState(session.id);
}

export function useEndSessionFlow(
  characterId: string,
  // Nullable so the flow can be lifted above the join guard — the hook must be called unconditionally even though confirmEnd never actually runs with a null session.
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
