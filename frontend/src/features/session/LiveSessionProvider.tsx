/* eslint-disable react-refresh/only-export-components -- provider module co-exports its use* hook beside the component; same-file hook+provider is intentional, HMR-only caveat */

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchActiveSession, fetchSessionDoorway } from "@/api/client";
import { sessionKeys } from "@/api/queryKeys";
import type { Session, SessionDoorwayState } from "@/types/character";

export type LiveSessionStatus = "loading" | "none" | "liveNotJoined" | "liveJoined";

export interface LiveSessionValue {
  status: LiveSessionStatus;
  doorway: SessionDoorwayState | null;
  /** Non-null only when liveJoined. */
  session: Session | null;
  /** Present whenever a session is active, joined or not. */
  sessionId: string | null;
  refresh: () => Promise<void>;
  /** Shared by RollProvider and the log view — bump on write, both re-read it. */
  logRefresh: number;
  bumpLog: () => void;
  /** Held here (not local state) so it survives a live-to-static flip. */
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

  // queryClient.ts sets refetchOnWindowFocus:false globally (a stray refetch could land
  // mid-transaction), but this query opts back in and drops staleTime to 0 so a
  // DM-ended session doesn't leave a zombie live tracker until the player reloads.
  const doorwayQuery = useQuery({
    queryKey: sessionKeys.doorway(characterId),
    queryFn: () => fetchSessionDoorway(characterId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const doorway = doorwayQuery.data ?? null;
  const loaded = doorwayQuery.isSuccess || doorwayQuery.isError;
  const activeNow = doorway?.session?.status === "active" && doorway.session.joined;

  // Same focus-refetch opt-in as the doorway: while joined, a stale participant list is
  // exactly what a focus refetch should catch (someone left/joined while backgrounded).
  const activeQuery = useQuery({
    queryKey: sessionKeys.active(characterId),
    queryFn: () => fetchActiveSession(characterId),
    enabled: activeNow,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // Gate on `activeNow`, not just the query's own data: disabling a query leaves its
  // last-fetched data sitting in the cache, and this must drop back to null the instant
  // the doorway says not-joined (a leave/end must not leave stale participants behind).
  const session = activeNow ? (activeQuery.data ?? null) : null;

  // The active-session key can't be invalidated like the doorway: its query is still
  // enabled:false at this point (the fresh doorway data hasn't rendered yet), so
  // invalidateQueries would no-op. Fetching it directly means refresh() cannot resolve
  // before the full session exists — #963's callers route to the live tracker off this
  // promise, not a stale static panel. The not-joined branch drops any previous
  // session's participants so a later join of a different session can't transiently
  // show the old roster.
  const refresh = useCallback(async () => {
    try {
      await queryClient.invalidateQueries({ queryKey: sessionKeys.doorway(characterId) });
      const fresh = queryClient.getQueryData<SessionDoorwayState>(sessionKeys.doorway(characterId));
      if (fresh?.session?.status === "active" && fresh.session.joined) {
        await queryClient.fetchQuery({
          queryKey: sessionKeys.active(characterId),
          queryFn: () => fetchActiveSession(characterId),
          staleTime: 0,
        });
      } else {
        queryClient.removeQueries({ queryKey: sessionKeys.active(characterId) });
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
