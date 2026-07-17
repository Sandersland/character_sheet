import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { joinSession, startCampaignSession } from "@/api/client";
import { useLiveSession } from "@/features/session/LiveSessionProvider";
import {
  summarizeSessionDoorway,
  type DoorwayAction,
  type SessionDoorwaySummary,
} from "@/features/session/sessionDoorwaySummary";
import type { Session, SessionDoorwayState } from "@/types/character";

// The network side of a doorway tap. "resume" needs no call — the character is
// already joined; join/start hit their existing endpoints before we navigate.
// Exported for direct unit testing of the join/start dispatch + guard.
export async function dispatchDoorwayAction(
  action: DoorwayAction,
  campaignId: string,
  sessionId: string | undefined,
  characterId: string,
): Promise<void> {
  if (action === "join") {
    // A liveNotJoined/earlyJoin doorway always carries a session, so this is a
    // can't-happen guard — but fail loud rather than skip the join and still
    // navigate to an empty session page (the signature admits undefined).
    if (!sessionId) throw new Error("Cannot join a session without a session id");
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
 * The sheet's session-doorway render state (#942), now a thin adapter over
 * `LiveSessionProvider` (#959) — it no longer fetches, so there is exactly ONE
 * doorway read per sheet. It distills the shared doorway into the bar's summary
 * and dispatches the start/join/resume action, re-resolving the shared state on
 * success so a just-started session lights up the workspace.
 */
export function useSessionDoorway(id: string | undefined): UseSessionDoorway {
  const navigate = useNavigate();
  const { status, doorway, session, sessionId, refresh } = useLiveSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = status !== "loading";
  const summary = doorway ? summarizeSessionDoorway(doorway) : HIDDEN_SUMMARY;

  const inActiveSession = status === "liveJoined";
  const activeSessionId = sessionId ?? undefined;
  // Prefer the full session (participants) when joined; else synthesize the
  // capture-dock slice from the doorway.
  const activeSession = session ?? (doorway ? toCaptureSession(doorway) : null);

  const onAction = async () => {
    const campaignId = doorway?.campaignId;
    if (!id || !campaignId || summary.action === null) return;
    setPending(true);
    setError(null);
    try {
      await dispatchDoorwayAction(summary.action, campaignId, activeSessionId, id);
      await refresh();
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
