import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchActiveSession, joinSession, startCampaignSession } from "@/api/client";
import type { Character, Session } from "@/types/character";

// Drives the sheet header's Start/Join/Resume Session button (#245).
export function useSessionButton(
  id: string | undefined,
  character: Character | null | undefined,
) {
  const navigate = useNavigate();
  const [activeSession, setActiveSession] = useState<Session | null | undefined>(undefined);
  const [sessionPending, setSessionPending] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Resolve active session on mount so the button label is correct.
  useEffect(() => {
    if (!id) return;
    fetchActiveSession(id).then(setActiveSession).catch(() => setActiveSession(null));
  }, [id]);

  const campaignId = character?.campaignId;
  const inActiveSession =
    activeSession?.participants?.some((p) => p.characterId === character?.id && !p.leftAt) ?? false;
  const sessionLabel = activeSession
    ? inActiveSession
      ? "Resume Session"
      : "Join Session"
    : "Start Session";

  const handleSessionButton = async () => {
    if (!id || !campaignId) return;
    setSessionPending(true);
    setSessionError(null);
    try {
      if (activeSession) {
        if (!inActiveSession) {
          await joinSession(campaignId, activeSession.id, id);
        }
      } else {
        const { session } = await startCampaignSession(campaignId, id);
        setActiveSession(session);
      }
      navigate(`/characters/${id}/session`);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : "Could not start or join the session.");
    } finally {
      setSessionPending(false);
    }
  };

  return {
    hasCampaign: Boolean(campaignId),
    sessionLabel,
    sessionPending,
    sessionReady: activeSession !== undefined,
    inActiveSession,
    activeSessionId: activeSession?.id,
    sessionError,
    handleSessionButton,
  };
}
