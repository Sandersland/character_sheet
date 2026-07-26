/* eslint-disable react-refresh/only-export-components -- provider module co-exports its use* hook beside the component; same-file hook+provider is intentional, HMR-only caveat */
/**
 * Workspace-level live-session identity (#959): the sheet needs to know whether
 * a session is live and whether this character is in it, so the Combat tab, the
 * live strip, the nav pip, and the doorway can all render off one server-derived
 * source (no per-surface fetch, no polling). Mount once above the sheet body.
 *
 * Doorway + full-session reads are query-cache-backed (#1299, sessionKeys) with
 * an explicit `refresh()` for callers that just mutated session state elsewhere
 * (start/join/leave/end) and can't wait for the next natural refetch. When
 * live+joined it also loads the FULL `Session` (participants) that
 * `partyHealAllies`/`SessionOverlays` need — one extra read, only when joined,
 * via the existing `fetchActiveSession` (no new endpoint).
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchActiveSession, fetchSessionDoorway } from "@/api/client";
import { sessionKeys } from "@/api/queryKeys";
import type { Session, SessionDoorwayState } from "@/types/character";

export type LiveSessionStatus = "loading" | "none" | "liveNotJoined" | "liveJoined";

export interface LiveSessionValue {
  status: LiveSessionStatus;
  /** Raw doorway state — strip/pip/doorway summaries derive from this. */
  doorway: SessionDoorwayState | null;
  /** FULL session (participants included) — non-null only when liveJoined. */
  session: Session | null;
  /** The live session's id (present whenever a session is active, joined or not). */
  sessionId: string | null;
  /** Re-resolve doorway + full session. Call after every lifecycle mutation. */
  refresh: () => Promise<void>;
  /** Session-log invalidation counter shared by RollProvider + the log view. */
  logRefresh: number;
  bumpLog: () => void;
  /** End-session recap pending dismissal — held here so it survives a live→static flip. */
  endedSession: Session | null;
  setEndedSession: (s: Session | null) => void;
}

const LiveSessionContext = createContext<LiveSessionValue | null>(null);

function deriveStatus(loaded: boolean, doorway: SessionDoorwayState | null): LiveSessionStatus {
  if (!loaded) return "loading";
  const s = doorway?.session;
  if (!s || s.status !== "active") return "none";
  return s.joined ? "liveJoined" : "liveNotJoined";
}

interface Props {
  characterId: string;
  children: ReactNode;
}

export function LiveSessionProvider({ characterId, children }: Props) {
  const queryClient = useQueryClient();
  const [logRefresh, setLogRefresh] = useState(0);
  const [endedSession, setEndedSession] = useState<Session | null>(null);

  // The doorway is the one query in the app that WANTS focus refetching:
  // queryClient.ts sets refetchOnWindowFocus:false globally because a stray
  // refetch could land mid-transaction, but a DM-ended session must not leave a
  // zombie live tracker until the player happens to reload — so this query
  // opts back in explicitly, and staleTime 0 (overriding the global 30s) so a
  // focus check always finds it stale enough to actually refetch. Replaces the
  // old manual visibilitychange listener.
  const doorwayQuery = useQuery({
    queryKey: sessionKeys.doorway(characterId),
    queryFn: () => fetchSessionDoorway(characterId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const doorway = doorwayQuery.data ?? null;
  const loaded = doorwayQuery.isSuccess || doorwayQuery.isError;
  const activeNow = doorway?.session?.status === "active" && doorway.session.joined;

  const activeQuery = useQuery({
    queryKey: sessionKeys.active(characterId),
    queryFn: () => fetchActiveSession(characterId),
    enabled: activeNow,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // Gate on `activeNow`, not just the query's own data: disabling a query
  // leaves its last-fetched data sitting in the cache, and this must drop back
  // to null the instant the doorway itself says not-joined (a leave/end must
  // not leave stale participants behind for `session`).
  const session = activeNow ? (activeQuery.data ?? null) : null;

  // Re-resolve both reads now, for callers that just changed session state
  // out-of-band (start/join/leave/end — see useCombatLifecycle, useSessionDoorway)
  // and can't wait for the next natural refetch. The query cache's own request
  // coalescing replaces the old seq-ref race guard: two overlapping refresh()
  // calls for the same key share one in-flight fetch, so a slow response can
  // never land — and overwrite the cache — after a newer one already has.
  // Never rejects, matching the old contract: a failed refresh just leaves the
  // reactive queries above to report it via isError.
  const refresh = useCallback(async () => {
    try {
      await queryClient.invalidateQueries({ queryKey: sessionKeys.doorway(characterId) });
      const fresh = queryClient.getQueryData<SessionDoorwayState>(sessionKeys.doorway(characterId));
      if (fresh?.session?.status === "active" && fresh.session.joined) {
        await queryClient.invalidateQueries({ queryKey: sessionKeys.active(characterId) });
      }
    } catch {
      // Swallowed — see the comment above.
    }
  }, [characterId, queryClient]);

  const bumpLog = useCallback(() => setLogRefresh((n) => n + 1), []);

  const value: LiveSessionValue = {
    status: deriveStatus(loaded, doorway),
    doorway,
    session,
    sessionId: doorway?.session?.id ?? null,
    refresh,
    logRefresh,
    bumpLog,
    endedSession,
    setEndedSession,
  };

  return <LiveSessionContext.Provider value={value}>{children}</LiveSessionContext.Provider>;
}

export function useLiveSession(): LiveSessionValue {
  const ctx = useContext(LiveSessionContext);
  if (!ctx) throw new Error("useLiveSession must be used inside <LiveSessionProvider>");
  return ctx;
}
