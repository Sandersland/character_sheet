import { useMutation, useQueryClient } from "@tanstack/react-query";

import { joinSession, startCampaignSession, startSoloSession } from "@/api/client";
import { characterKeys } from "@/api/queryKeys";
import { useLiveSession } from "@/features/session/LiveSessionProvider";
import {
  summarizeSessionDoorway,
  type DoorwayAction,
  type SessionDoorwaySummary,
} from "@/features/session/sessionDoorwaySummary";
import { errorMessage } from "@/lib/errorMessage";
import type { Character, Session, SessionDoorwayState } from "@/types/character";

// The network side of a doorway tap. "resume" needs no call — the character is
// already joined; join/start hit their existing endpoints before we navigate.
// A null campaignId means a solo (campaign-less) character: start routes to
// startSoloSession, while join is campaign-only and fails loud (#1082).
// start* returns the session's updated character (shape D, #1283) — the caller
// writes it into the character query cache; join returns nothing to write.
// Exported for direct unit testing of the join/start dispatch + guard.
export async function dispatchDoorwayAction(
  action: DoorwayAction,
  campaignId: string | null,
  sessionId: string | undefined,
  characterId: string,
): Promise<Character | undefined> {
  if (action === "join") {
    // Joining is inherently campaign-only (a solo doorway never offers it), so a
    // null campaignId here is a can't-happen — fail loud rather than reinterpret.
    if (campaignId === null) throw new Error("Cannot join a session without a campaign");
    // A liveNotJoined/earlyJoin doorway always carries a session, so this is a
    // can't-happen guard — but fail loud rather than skip the join and still
    // navigate to an empty session page (the signature admits undefined).
    if (!sessionId) throw new Error("Cannot join a session without a session id");
    await joinSession(campaignId, sessionId, characterId);
    return undefined;
  } else if (action === "start") {
    if (campaignId === null) return (await startSoloSession(characterId)).character;
    return (await startCampaignSession(campaignId, characterId)).character;
  }
  return undefined;
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
// without a second fetch. campaignId flows through as-is — null for a solo
// session (#1082), which the dock handles like any other active session.
function toCaptureSession(state: SessionDoorwayState): Session | null {
  const s = state.session;
  if (!s || s.status !== "active" || s.startedAt === null) return null;
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
 * and dispatches the start/join/resume action as a mutation (#1299), re-resolving
 * the shared doorway/session queries on success so a just-started session lights
 * up the workspace. On success it jumps **in-workspace** to the Combat tab (#963)
 * via `onEnterCombat` — no more `navigate('/characters/:id/session')`; the live
 * tracker lives under Combat now.
 */
export function useSessionDoorway(
  id: string | undefined,
  onEnterCombat: () => void = () => {},
): UseSessionDoorway {
  const { status, doorway, session, sessionId, refresh } = useLiveSession();
  const queryClient = useQueryClient();

  const ready = status !== "loading";
  const summary = doorway ? summarizeSessionDoorway(doorway) : HIDDEN_SUMMARY;

  const inActiveSession = status === "liveJoined";
  const activeSessionId = sessionId ?? undefined;
  // Prefer the full session (participants) when joined; else synthesize the
  // capture-dock slice from the doorway.
  const activeSession = session ?? (doorway ? toCaptureSession(doorway) : null);

  const doorwayMutation = useMutation({
    mutationFn: async (action: DoorwayAction) => {
      // `onAction`'s guard below never calls mutate without id + doorway set,
      // so the non-null assertions here are can't-happen, not a real risk.
      const character = await dispatchDoorwayAction(action, doorway!.campaignId, activeSessionId, id!);
      // start* returns the session's updated character (shape D, #1283) — an
      // exact write, same bias as useCharacterMutation: join returns none.
      if (character) queryClient.setQueryData(characterKeys.detail(id), character);
      // Re-resolve BEFORE switching so Combat renders the live tracker, not the
      // static panel off stale not-joined state (#963 addendum).
      await refresh();
    },
  });

  const onAction = async () => {
    // A solo doorway carries campaignId === null (a legit start target), so the
    // guard checks the character + a dispatchable action, not campaign presence.
    if (!id || !doorway || summary.action === null) return;
    try {
      await doorwayMutation.mutateAsync(summary.action);
      onEnterCombat();
    } catch {
      // Surfaced via doorwayMutation.error below — nothing further to do here.
    }
  };

  return {
    ready,
    summary,
    pending: doorwayMutation.isPending,
    error: doorwayMutation.error
      ? errorMessage(doorwayMutation.error, "Could not start or join the session.")
      : null,
    onAction: () => {
      void onAction();
    },
    inActiveSession,
    activeSessionId,
    activeSession,
  };
}
