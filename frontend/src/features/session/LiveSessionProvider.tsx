/* eslint-disable react-refresh/only-export-components -- provider module co-exports its use* hook beside the component; same-file hook+provider is intentional, HMR-only caveat */
/**
 * Workspace-level live-session identity (#959): the sheet needs to know whether
 * a session is live and whether this character is in it, so the Combat tab, the
 * live strip, the nav pip, and the doorway can all render off one server-derived
 * source (no per-surface fetch, no polling). Mount once above the sheet body.
 *
 * The doorway read is fetch-once by nature, so this exposes an explicit
 * `refresh()` (call after every start/join/leave/end) and self-refreshes on
 * `visibilitychange` — a DM-ended session must not leave a zombie live tracker
 * until a full reload. When live+joined it also loads the FULL `Session`
 * (participants) that `partyHealAllies`/`SessionOverlays` need — one extra read,
 * only when joined, via the existing `fetchActiveSession` (no new endpoint).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { fetchActiveSession, fetchSessionDoorway } from "@/api/client";
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
  const [doorway, setDoorway] = useState<SessionDoorwayState | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [logRefresh, setLogRefresh] = useState(0);
  const [endedSession, setEndedSession] = useState<Session | null>(null);
  // Monotonic request nonce: rapid refreshes (e.g. successive visibilitychange
  // events) race, and a slow stale response must never overwrite a newer one —
  // that would resurrect a zombie tracker. Only the latest in-flight call writes.
  const refreshSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    try {
      const d = await fetchSessionDoorway(characterId);
      // The doorway lacks participants — the live panel needs the full Session
      // (partyHealAllies, SessionOverlays). One extra read, only when joined.
      const full =
        d.session?.status === "active" && d.session.joined
          ? await fetchActiveSession(characterId)
          : null;
      if (seq !== refreshSeqRef.current) return; // a newer refresh has started
      setDoorway(d);
      setSession(full);
    } catch {
      if (seq !== refreshSeqRef.current) return;
      setDoorway(null);
      setSession(null);
    } finally {
      if (seq === refreshSeqRef.current) setLoaded(true);
    }
  }, [characterId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-resolve when the tab regains visibility — the session may have been
  // started/ended elsewhere while backgrounded. Event-driven, not polling.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

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
