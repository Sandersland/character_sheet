import { useEffect, useRef } from "react";

import { fetchCombatState } from "@/api/client";

const POLL_MS = 5000;

/**
 * Polls the server's authoritative combat state (~5s) while a live-joined
 * session is present (#1030), so a remote participant's Start/End Combat or
 * End Turn shows up here without a tab refocus — `active` gates on
 * `status === "liveJoined"`, not the LOCAL `inCombat` flag: gating on the
 * latter would make a remote combat START undetectable (this client doesn't
 * know it's happening yet, so it could never flip its own local flag to
 * start polling for it). Paused while the tab is hidden — a background timer
 * would just burn requests nobody sees — and cleared on unmount.
 */
export function useCombatPoll(
  characterId: string,
  sessionId: string | null,
  active: boolean,
  onSync: (round: number, combatActive: boolean) => void,
): void {
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  useEffect(() => {
    if (!active || !sessionId) return;
    const id = sessionId;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function poll(): Promise<void> {
      try {
        const state = await fetchCombatState(characterId, id);
        if (!cancelled) onSyncRef.current(state.round, state.combatActive);
      } catch {
        // Best-effort — a failed poll just waits for the next tick.
      }
    }

    function start(): void {
      if (intervalId !== null) return;
      void poll();
      intervalId = setInterval(() => void poll(), POLL_MS);
    }

    function stop(): void {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    }

    function handleVisibility(): void {
      if (document.hidden) stop();
      else start();
    }

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [characterId, sessionId, active]);
}
