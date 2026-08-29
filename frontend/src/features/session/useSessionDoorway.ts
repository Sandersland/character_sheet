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

// "resume" makes no network call — the character is already joined.
export async function dispatchDoorwayAction(
  action: DoorwayAction,
  campaignId: string | null,
  sessionId: string | undefined,
  characterId: string,
): Promise<Character | undefined> {
  if (action === "join") {
    // A null campaignId here is a can't-happen (a solo doorway never offers join) — fail loud rather than reinterpret.
    if (campaignId === null) throw new Error("Cannot join a session without a campaign");
    // A can't-happen guard (a liveNotJoined/earlyJoin doorway always carries a session) — fail loud rather than silently skip the join.
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
  ready: boolean;
  summary: SessionDoorwaySummary;
  pending: boolean;
  /** A failed READ keeps `ready` false instead — this error is only for a failed start/join action. */
  error: string | null;
  onAction: () => void;
  inActiveSession: boolean;
  activeSessionId: string | undefined;
  activeSession: Session | null;
}

// Synthesizes a minimal Session (capture dock reads only status/startedAt/title) so the dock avoids a second fetch; campaignId flows through as null for solo (#1082).
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
 * Exactly one doorway read per sheet — a thin adapter over LiveSessionProvider, never a second fetch.
 * Jumps in-workspace via `onEnterCombat` on success — never navigates to /session (#963).
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
  const activeSession = session ?? (doorway ? toCaptureSession(doorway) : null);

  const doorwayMutation = useMutation({
    // Shares `character-<id>` scope with useCharacterMutation so a Start/Join response can't land out of order with an HP response and drag the cache backward.
    scope: { id: `character-${id}` },
    mutationFn: async (action: DoorwayAction) => {
      // onAction's guard below never calls mutate without id + doorway set, so these non-null assertions are can't-happen.
      const character = await dispatchDoorwayAction(action, doorway!.campaignId, activeSessionId, id!);
      // start* returns the session's updated character as an exact cache write (shape D, #1283), same bias as useCharacterMutation; join returns none.
      if (character) queryClient.setQueryData(characterKeys.detail(id), character);
      // refresh() must resolve before onEnterCombat, or Combat renders the stale not-joined panel instead of the live tracker (#963).
      await refresh();
    },
  });

  const onAction = async () => {
    // A solo doorway has campaignId === null but is still a legit start target, so this guard checks action presence, not campaignId.
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
