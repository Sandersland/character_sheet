/**
 * useSessionLifecycle — the SessionContent orchestrator's async state + handlers:
 * owner check, log-refresh counter, End-Session (with guarded XP award) and
 * Leave flows, and the end/capture overlay open-state. Keeps SessionContent a
 * thin render over these named callbacks.
 */

import { useState } from "react";
import type { useNavigate } from "react-router-dom";

import {
  leaveAndClearTurnState,
  useEndSessionFlow,
  useIsSessionOwner,
  usePendingAction,
} from "@/features/session/sessionLifecycleHelpers";
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
  const [endedSession, setEndedSession] = useState<Session | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [logRefresh, setLogRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState("inventory");
  const end = usePendingAction();
  const leave = usePendingAction();
  const endFlow = useEndSessionFlow(character.id, session, end);
  const isOwner = useIsSessionOwner(session.campaignId);

  const bumpLog = () => setLogRefresh((n) => n + 1);

  function handleCharacterUpdate(updated: Character) {
    setCharacter(updated);
    bumpLog();
  }

  const handleConfirmEnd = (xpAmount: number) =>
    endFlow.confirmEnd(xpAmount, (ended) => setEndedSession(ended));

  const handleLeave = () =>
    leave.run(async () => {
      await leaveAndClearTurnState(session, character.id);
      navigate(`/characters/${character.id}`);
    }, "Failed to leave the session. Please try again.");

  return {
    endPending: end.pending,
    endError: end.error,
    endPromptOpen: endFlow.endPromptOpen,
    endedSession,
    captureOpen,
    leavePending: leave.pending,
    leaveError: leave.error,
    isOwner,
    logRefresh,
    activeTab,
    setActiveTab,
    bumpLog,
    openCapture: () => setCaptureOpen(true),
    closeCapture: () => setCaptureOpen(false),
    toggleCapture: () => setCaptureOpen((open) => !open),
    openEndPrompt: endFlow.openEndPrompt,
    closeEndPrompt: endFlow.closeEndPrompt,
    goToSheet: () => navigate(`/characters/${character.id}`),
    handleCharacterUpdate,
    handleConfirmEnd,
    handleLeave,
  };
}
