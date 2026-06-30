import { useEffect, useState } from "react";

import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import SessionSummaryModal from "@/features/session/SessionSummaryModal";
import { fetchCampaignSessions } from "@/api/client";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import type { Session } from "@/types/character";

interface SessionsModalProps {
  /** Owning character — still needed for the recap's retroactive XP form. */
  characterId: string;
  /** Campaign whose session history is listed; undefined when uncampaigned. */
  campaignId?: string;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Module-level cache for stale-while-revalidate: reopening the modal renders the
// last-known sessions list instantly while a fresh fetch confirms it in the
// background. The cache never short-circuits the network — every open refetches,
// so a just-ended session can't linger as "active". Keyed by campaignId.
const sessionsCache = new Map<string, { sessions: Session[] }>();

/**
 * Lists a campaign's play sessions (newest first, #245). Clicking an ended
 * session opens its read-only recap (SessionSummaryModal). This is the entry
 * point for reviewing a past shared session from the character sheet.
 */
export default function SessionsModal({ characterId, campaignId, onClose }: SessionsModalProps) {
  // Uncampaigned characters have no shared sessions — render an empty list.
  const [sessions, setSessions] = useState<Session[] | null>(() =>
    campaignId ? (sessionsCache.get(campaignId)?.sessions ?? null) : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Session | null>(null);
  const showSpinner = useDelayedFlag(sessions === null && !error);

  useEffect(() => {
    if (!campaignId) {
      setSessions([]);
      return;
    }
    const cached = sessionsCache.get(campaignId);
    setSessions(cached?.sessions ?? null);
    setError(null);

    // Always refetch on open so a just-ended session can't render as stale; the
    // cached list above is only a placeholder until the network confirms.
    let cancelled = false;
    fetchCampaignSessions(campaignId)
      .then((fetched) => {
        sessionsCache.set(campaignId, { sessions: fetched });
        if (!cancelled) setSessions(fetched);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load sessions — try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  // While a past session's recap is open, render it on top of the list.
  if (selected) {
    return (
      <SessionSummaryModal
        characterId={characterId}
        session={selected}
        onClose={() => setSelected(null)}
      />
    );
  }

  return (
    <Modal title="Sessions" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}

        {sessions === null && !error && showSpinner && <Spinner />}

        {sessions !== null && sessions.length === 0 && (
          <p className="py-6 text-center text-sm text-parchment-600">
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
                      <span className="text-xs text-parchment-600">
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
