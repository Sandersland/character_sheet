import { useCallback, useEffect, useRef } from "react";

import { fetchCombatState } from "@/api/client";
import type { SpellEconomyState } from "@/types/character";

const POLL_MS = 5000;

/** A manual, on-demand combat-state resync (#1439) — fetch once and sync. */
export type CombatRefresh = () => Promise<void>;

/**
 * Polls the server's authoritative combat state (~5s) while a live-joined
 * session is present (#1030), so a remote participant's Start/End Combat or
 * End Turn shows up here without a tab refocus — `active` gates on
 * `status === "liveJoined"`, not the LOCAL `inCombat` flag: gating on the
 * latter would make a remote combat START undetectable (this client doesn't
 * know it's happening yet, so it could never flip its own local flag to
 * start polling for it). Paused while the tab is hidden — a background timer
 * would just burn requests nobody sees — and cleared on unmount.
 *
 * Returns a stable `refresh` (#1439) so a just-committed spell cast can pull the
 * server-resolved bonus-action interlock immediately, instead of waiting up to
 * ~5s for the next poll tick — the cast records the interlock on the
 * participant row, and `refresh` is how this client observes it now.
 */
export function useCombatPoll(
  characterId: string,
  sessionId: string | null,
  active: boolean,
  onSync: (round: number, combatActive: boolean, updatedAt: string, spellEconomy: SpellEconomyState) => void,
): CombatRefresh {
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  const refresh = useCallback<CombatRefresh>(async () => {
    if (!sessionId) return;
    try {
      const state = await fetchCombatState(characterId, sessionId);
      onSyncRef.current(state.round, state.combatActive, state.updatedAt, state.spellEconomy);
    } catch {
      // Best-effort — the ~5s poll will reconcile on the next tick.
    }
  }, [characterId, sessionId]);

  useEffect(() => {
    if (!active || !sessionId) return;
    const id = sessionId;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let lastPollAt = 0;

    async function poll(): Promise<void> {
      lastPollAt = Date.now();
      try {
        const state = await fetchCombatState(characterId, id);
        if (!cancelled) onSyncRef.current(state.round, state.combatActive, state.updatedAt, state.spellEconomy);
      } catch {
        // Best-effort — a failed poll just waits for the next tick.
      }
    }

    function start(): void {
      if (intervalId !== null) return;
      // Throttle the resume path: rapid hidden→shown toggles (tab-switching)
      // each call start() — without this, N toggles fire N immediate polls in
      // ~0ms. Skip the immediate poll if one already ran within POLL_MS.
      if (Date.now() - lastPollAt >= POLL_MS) void poll();
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

  return refresh;
}
