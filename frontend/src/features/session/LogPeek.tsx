/**
 * LogPeek (#1028) — the one-line session-log peek pinned at the bottom of the
 * mobile Combat tab, above the bottom nav. Shows the latest event summary and a
 * "View log ›" affordance; the whole strip taps to open the full log bottom
 * sheet. Mobile-only — the desktop log lives in its own right rail.
 */

import { useEffect, useState } from "react";

import { fetchSession } from "@/api/client";
import type { CharacterEvent } from "@/types/character";

interface LogPeekProps {
  characterId: string;
  sessionId: string;
  /** Re-fetch when a roll/turn action logs an event (shared logRefresh counter). */
  refreshKey?: unknown;
  onOpen: () => void;
}

export default function LogPeek({ characterId, sessionId, refreshKey, onOpen }: LogPeekProps) {
  const [latest, setLatest] = useState<CharacterEvent | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSession(characterId, sessionId)
      .then((data) => {
        if (!alive) return;
        const events = data.events as CharacterEvent[];
        setLatest(
          events.find(
            (e) => !e.reverted && e.type !== "revert" && e.type !== "combatRoundAdvanced",
          ) ?? null,
        );
      })
      .catch(() => {
        if (alive) setLatest(null);
      });
    return () => {
      alive = false;
    };
  }, [characterId, sessionId, refreshKey]);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="View session log"
      className="pressable flex w-full items-center gap-2 bg-parchment-100 px-4 py-2.5 text-left"
    >
      <span className="min-w-0 flex-1 truncate text-[13px] text-parchment-600">
        {latest ? latest.summary : "No events yet"}
      </span>
      <span className="shrink-0 text-[13px] font-semibold text-garnet-700">View log ›</span>
    </button>
  );
}
