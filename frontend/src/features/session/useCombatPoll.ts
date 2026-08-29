import { useCallback, useEffect, useRef } from "react";

import { fetchCombatState } from "@/api/client";
import type { SpellEconomyState } from "@/types/character";

const POLL_MS = 5000;

export type CombatRefresh = () => Promise<void>;

// `active` gates on status === "liveJoined", not the local inCombat flag — gating on the latter would make a remote combat START undetectable, since this client wouldn't know to start polling for it.
export function useCombatPoll(
  characterId: string,
  sessionId: string | null,
  active: boolean,
  onSync: (round: number, combatActive: boolean, updatedAt: string, spellEconomy: SpellEconomyState) => void,
): CombatRefresh {
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;
  // `active` is read through a ref so refresh() can re-check it after its own await — a refresh resolving after the session ended/left must not re-apply a now-stale combat state.
  const activeRef = useRef(active);
  activeRef.current = active;

  const refresh = useCallback<CombatRefresh>(async () => {
    if (!sessionId || !activeRef.current) return;
    try {
      const state = await fetchCombatState(characterId, sessionId);
      if (!activeRef.current) return; // torn down while the fetch was in flight
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
      // Throttles the resume path: rapid hidden→shown toggles each call start(), so skip the immediate poll if one already ran within POLL_MS.
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
