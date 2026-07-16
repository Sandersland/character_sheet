import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchSessionDoorway, joinSession, startCampaignSession } from "@/api/client";
import {
  summarizeSessionDoorway,
  type DoorwayAction,
  type SessionDoorwaySummary,
} from "@/features/session/sessionDoorwaySummary";
import type { Session, SessionDoorwayState } from "@/types/character";

// undefined = still loading; null = the read failed (bar renders nothing).
type DoorwayResult = SessionDoorwayState | null | undefined;

// The network side of a doorway tap. "resume" needs no call — the character is
// already joined; join/start hit their existing endpoints before we navigate.
async function dispatchDoorwayAction(
  action: DoorwayAction,
  campaignId: string,
  sessionId: string | undefined,
  characterId: string,
): Promise<void> {
  if (action === "join" && sessionId) {
    await joinSession(campaignId, sessionId, characterId);
  } else if (action === "start") {
    await startCampaignSession(campaignId, characterId);
  }
}

export interface UseSessionDoorway {
  /** True once the doorway read has resolved (successfully) — gate rendering on it. */
  ready: boolean;
  summary: SessionDoorwaySummary;
  /** A start/join is in flight; the bar disables during it. */
  pending: boolean;
  /** Inline action error (start/join). A failed READ instead keeps `ready` false. */
  error: string | null;
  /** Dispatch the summary's action (resume/join/start). No-op when action is null. */
  onAction: () => void;
  // Threaded into RollProvider + the capture dock, mirroring the old hook.
  inActiveSession: boolean;
  activeSessionId: string | undefined;
  activeSession: Session | null;
}

// The capture dock reads only status/startedAt/title; synthesize a minimal
// Session from the doorway's live-session state so the ⌘J dock header still works
// without a second fetch.
function toCaptureSession(state: SessionDoorwayState): Session | null {
  const s = state.session;
  if (!s || state.campaignId === null || s.status !== "active" || s.startedAt === null) return null;
  return { id: s.id, campaignId: state.campaignId, status: "active", startedAt: s.startedAt, title: s.title ?? undefined };
}

const HIDDEN_SUMMARY: SessionDoorwaySummary = {
  visible: false,
  tone: "invite",
  label: "",
  sub: null,
  action: null,
};

/**
 * Owns the sheet's session-doorway state (#942): resolves the doorway on mount
 * (same resolve-on-mount cadence as the old fetchActiveSession — no polling),
 * distills it to the render summary, and dispatches the start/join/resume action.
 * Replaces useSessionButton — the SessionDoorway bar is a dumb renderer of this.
 */
export function useSessionDoorway(id: string | undefined): UseSessionDoorway {
  const navigate = useNavigate();
  const [doorway, setDoorway] = useState<DoorwayResult>(undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchSessionDoorway(id).then(setDoorway).catch(() => setDoorway(null));
  }, [id]);

  const ready = doorway !== undefined && doorway !== null;
  const summary = ready ? summarizeSessionDoorway(doorway) : HIDDEN_SUMMARY;

  const liveSession = doorway?.session ?? null;
  const inActiveSession = liveSession?.joined ?? false;
  const activeSessionId = liveSession?.id;
  const activeSession = doorway ? toCaptureSession(doorway) : null;

  const onAction = async () => {
    const campaignId = doorway?.campaignId;
    if (!id || !campaignId || summary.action === null) return;
    setPending(true);
    setError(null);
    try {
      await dispatchDoorwayAction(summary.action, campaignId, activeSessionId, id);
      navigate(`/characters/${id}/session`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start or join the session.");
    } finally {
      setPending(false);
    }
  };

  return {
    ready,
    summary,
    pending,
    error,
    onAction: () => {
      void onAction();
    },
    inActiveSession,
    activeSessionId,
    activeSession,
  };
}
