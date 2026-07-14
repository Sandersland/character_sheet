/**
 * useSessionLifecycle — the SessionContent orchestrator's async state + handlers:
 * owner check, log-refresh counter, End-Session (with guarded XP award) and
 * Leave flows, and the end/capture overlay open-state. Keeps SessionContent a
 * thin render over these named callbacks.
 */

import { useEffect, useRef, useState } from "react";
import type { useNavigate } from "react-router-dom";

import { applyExperienceOperations, endSession, fetchCampaign, leaveSession } from "@/api/client";
import { clearTurnState } from "@/features/session/turnStatePersistence";
import { errorMessage } from "@/lib/errorMessage";
import type { Character, Session } from "@/types/character";

export function useSessionLifecycle({
  character,
  session,
  setCharacter,
  navigate,
}: {
  character: Character;
  session: Session;
  setCharacter: (c: Character) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [endPending, setEndPending] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [endPromptOpen, setEndPromptOpen] = useState(false);
  const [endedSession, setEndedSession] = useState<Session | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [leavePending, setLeavePending] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [logRefresh, setLogRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState("inventory");
  // Remembers a landed XP award for this prompt, so an endSession retry doesn't re-award.
  const awardedRef = useRef(false);

  const bumpLog = () => setLogRefresh((n) => n + 1);

  useEffect(() => {
    let cancelled = false;
    fetchCampaign(session.campaignId)
      .then((c) => {
        if (!cancelled) setIsOwner(c.role === "OWNER");
      })
      .catch(() => {
        /* non-owners simply never see the Loot tab */
      });
    return () => {
      cancelled = true;
    };
  }, [session.campaignId]);

  function handleCharacterUpdate(updated: Character) {
    setCharacter(updated);
    bumpLog();
  }

  function openEndPrompt() {
    awardedRef.current = false;
    setEndError(null);
    setEndPromptOpen(true);
  }

  // KEY ORDERING: award XP while the session is still active (auto-tagged with
  // this sessionId → recap xpGained) BEFORE ending. awardedRef guards a retry
  // after an endSession failure from double-awarding.
  async function handleConfirmEnd(xpAmount: number) {
    setEndPending(true);
    setEndError(null);
    try {
      if (xpAmount > 0 && !awardedRef.current) {
        await applyExperienceOperations(character.id, [{ type: "award", amount: xpAmount }]);
        awardedRef.current = true;
      }
      clearTurnState(session.id);
      const { session: ended } = await endSession(session.campaignId, session.id);
      setEndPromptOpen(false);
      setEndedSession(ended);
    } catch (err) {
      setEndError(errorMessage(err, "Failed to end the session. Please try again."));
    } finally {
      setEndPending(false);
    }
  }

  async function handleLeave() {
    setLeavePending(true);
    setLeaveError(null);
    try {
      await leaveSession(session.campaignId, session.id, character.id);
      clearTurnState(session.id);
      navigate(`/characters/${character.id}`);
    } catch (err) {
      setLeaveError(errorMessage(err, "Failed to leave the session. Please try again."));
    } finally {
      setLeavePending(false);
    }
  }

  return {
    endPending,
    endError,
    endPromptOpen,
    endedSession,
    captureOpen,
    leavePending,
    leaveError,
    isOwner,
    logRefresh,
    activeTab,
    setActiveTab,
    bumpLog,
    openCapture: () => setCaptureOpen(true),
    closeCapture: () => setCaptureOpen(false),
    toggleCapture: () => setCaptureOpen((open) => !open),
    openEndPrompt,
    closeEndPrompt: () => {
      setEndError(null);
      setEndPromptOpen(false);
    },
    goToSheet: () => navigate(`/characters/${character.id}`),
    handleCharacterUpdate,
    handleConfirmEnd,
    handleLeave,
  };
}
