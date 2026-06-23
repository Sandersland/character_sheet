import { useEffect, useState } from "react";

import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import SessionSummaryModal from "@/features/session/SessionSummaryModal";
import { fetchSessions } from "@/api/client";
import type { Session } from "@/types/character";

interface SessionsModalProps {
  characterId: string;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Lists a character's play sessions (newest first). Clicking an ended session
 * opens its read-only recap (SessionSummaryModal). This is the entry point for
 * reviewing a past session's summary from the character sheet.
 */
export default function SessionsModal({ characterId, onClose }: SessionsModalProps) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Session | null>(null);

  useEffect(() => {
    fetchSessions(characterId)
      .then(setSessions)
      .catch(() => setError("Couldn't load sessions — try again."));
  }, [characterId]);

  // While a past session's recap is open, render it on top of the list.
  if (selected) {
    return <SessionSummaryModal session={selected} onClose={() => setSelected(null)} />;
  }

  return (
    <Modal title="Sessions" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}

        {sessions === null && !error && (
          <p className="text-sm text-parchment-500">Loading…</p>
        )}

        {sessions !== null && sessions.length === 0 && (
          <p className="py-6 text-center text-sm text-parchment-500">
            No sessions yet. Start a session from the character sheet to begin live play.
          </p>
        )}

        {sessions && sessions.length > 0 && (
          <ul className="flex flex-col gap-2">
            {sessions.map((session) => {
              const ended = session.status === "ended";
              const hasSummary = Boolean(session.summary);
              return (
                <li key={session.id}>
                  <button
                    type="button"
                    disabled={!hasSummary}
                    onClick={() => setSelected(session)}
                    className="flex w-full items-center justify-between gap-3 rounded-card border border-parchment-200 bg-parchment-50 px-3 py-2.5 text-left transition-colors enabled:hover:bg-parchment-100 disabled:cursor-default disabled:opacity-60"
                  >
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-parchment-900">
                        {session.title ?? "Untitled session"}
                      </span>
                      <span className="text-xs text-parchment-500">
                        {formatDate(session.startedAt)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {ended ? (
                        <Badge tone="neutral">ended</Badge>
                      ) : (
                        <Badge tone="vitality">active</Badge>
                      )}
                      {hasSummary && (
                        <span className="text-xs font-semibold text-arcane-700">View recap →</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
