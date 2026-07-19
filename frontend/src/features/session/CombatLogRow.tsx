import { useEffect, useState } from "react";

import { fetchSession, fetchSessions } from "@/api/client";
import { ChevronRight } from "@/components/ui/icons";
import type { CharacterEvent, Session } from "@/types/character";

// Idle: surface the most recent ended session, tapping opens its log. Live: a
// running event count for the active session, tapping opens the live log. Both
// collapse the log to a single line (#1086) — desktop opens a right Drawer, mobile
// a BottomSheet, wired by the parent.
type CombatLogRowProps =
  | { mode: "idle"; characterId: string; onOpen: (sessionId: string) => void }
  | { mode: "live"; characterId: string; sessionId: string; refreshKey?: unknown; onOpen: () => void };

export default function CombatLogRow(props: CombatLogRowProps) {
  return props.mode === "idle" ? (
    <IdleLogRow characterId={props.characterId} onOpen={props.onOpen} />
  ) : (
    <LiveLogRow
      characterId={props.characterId}
      sessionId={props.sessionId}
      refreshKey={props.refreshKey}
      onOpen={props.onOpen}
    />
  );
}

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function IdleLogRow({ characterId, onOpen }: { characterId: string; onOpen: (id: string) => void }) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // Guard the async setState: the idle Combat panel unmounts the moment a
    // session starts (the live panel supersedes it).
    let alive = true;
    fetchSessions(characterId)
      .then((list) => {
        if (alive) setSession(list.find((s) => s.status === "ended") ?? null);
      })
      .catch(() => {
        if (alive) setSession(null);
      });
    return () => {
      alive = false;
    };
  }, [characterId]);

  if (!session) return null;
  const label = session.title ?? formatSessionDate(session.startedAt);
  return (
    <LogRow
      text={`Last session · ${label}`}
      cta="Log"
      ariaLabel={`Open last session log: ${label}`}
      onClick={() => onOpen(session.id)}
    />
  );
}

function LiveLogRow({
  characterId,
  sessionId,
  refreshKey,
  onOpen,
}: {
  characterId: string;
  sessionId: string;
  refreshKey?: unknown;
  onOpen: () => void;
}) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSession(characterId, sessionId)
      .then((data) => {
        if (!alive) return;
        // Match the SessionLog feed: drop reverted/undo + the noisy round markers.
        const events = (data.events as CharacterEvent[]).filter(
          (e) => !e.reverted && e.type !== "revert" && e.type !== "combatRoundAdvanced",
        );
        setCount(events.length);
      })
      .catch(() => {
        if (alive) setCount(null);
      });
    return () => {
      alive = false;
    };
  }, [characterId, sessionId, refreshKey]);

  const n = count ?? 0;
  return (
    <LogRow
      text={`Session log · ${n} event${n === 1 ? "" : "s"}`}
      cta="Open"
      ariaLabel="Open session log"
      onClick={onOpen}
    />
  );
}

function LogRow({
  text,
  cta,
  ariaLabel,
  onClick,
}: {
  text: string;
  cta: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-control px-1 py-2 text-left text-sm text-parchment-600 transition-colors hover:bg-parchment-100"
    >
      <span className="min-w-0 truncate">{text}</span>
      <span className="flex shrink-0 items-center gap-0.5 font-semibold text-garnet-700">
        {cta}
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </button>
  );
}
