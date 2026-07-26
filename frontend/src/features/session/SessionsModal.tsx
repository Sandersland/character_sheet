import { useState } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";

import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import SessionSummaryModal from "@/features/session/SessionSummaryModal";
import { fetchCampaignSessions } from "@/api/client";
import { sessionKeys } from "@/api/queryKeys";
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

// One session row: title/date + status badge + a recap link when one exists.
// Split out (mirrors CampaignItemRow) so SessionsModal's own render stays a
// simple loading/error/empty/list switch, not a nested per-row branch too.
function SessionRow({ session, onSelect }: { session: Session; onSelect: (s: Session) => void }) {
  const hasSummary = Boolean(session.summary);
  return (
    <li>
      <button
        type="button"
        disabled={!hasSummary}
        onClick={() => onSelect(session)}
        className="flex w-full items-center justify-between gap-3 rounded-card border border-parchment-200 bg-parchment-50 px-3 py-2.5 text-left transition-colors enabled:hover:bg-parchment-100 disabled:cursor-default disabled:opacity-60"
      >
        <span className="flex flex-col">
          <span className="text-sm font-semibold text-parchment-900">
            {session.title ?? "Untitled session"}
          </span>
          <span className="text-xs text-parchment-600">{formatDate(session.startedAt)}</span>
        </span>
        <span className="flex items-center gap-2">
          {session.status === "ended" ? (
            <Badge tone="neutral">ended</Badge>
          ) : (
            <Badge tone="vitality">active</Badge>
          )}
          {hasSummary && <span className="text-xs font-semibold text-arcane-700">View recap →</span>}
        </span>
      </button>
    </li>
  );
}

// Error and list are siblings, not exclusive branches: query-core sets
// status:'error' even when `data` is retained, so a failed background
// refetch of a warm cache must show the error line ALONGSIDE the last-known
// list, not instead of it (re-review — an early-return-on-error regressed
// this).
function SessionsListBody({
  list,
  error,
  showSpinner,
  onSelect,
}: {
  list: Session[] | null;
  error: string | null;
  showSpinner: boolean;
  onSelect: (s: Session) => void;
}) {
  return (
    <>
      {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}

      {list === null && !error && showSpinner && <Spinner />}

      {list !== null && list.length === 0 && (
        <p className="py-6 text-center text-sm text-parchment-600">
          No sessions yet. Start a session from the character sheet to begin live play.
        </p>
      )}

      {list && list.length > 0 && (
        <ul className="flex flex-col gap-2">
          {list.map((session) => (
            <SessionRow key={session.id} session={session} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Lists a campaign's play sessions (newest first, #245). Clicking an ended
 * session opens its read-only recap (SessionSummaryModal). This is the entry
 * point for reviewing a past shared session from the character sheet.
 */
export default function SessionsModal({ characterId, campaignId, onClose }: SessionsModalProps) {
  const [selected, setSelected] = useState<Session | null>(null);

  // staleTime:0 (overriding the global 30s), same rationale as the doorway
  // (#1299): every open must confirm with the network so a just-ended session
  // can't render as stale — the cached list is only a placeholder until then.
  // Query-cache-backed replaces a hand-rolled module-level Map (docs/frontend.md
  // forbids it) — stale-while-revalidate is what useQuery already does.
  const { data: sessions, isError } = useQuery({
    queryKey: sessionKeys.campaignList(campaignId),
    queryFn: campaignId ? () => fetchCampaignSessions(campaignId) : skipToken,
    staleTime: 0,
  });

  // Uncampaigned characters have no shared sessions — render an empty list.
  const list = campaignId ? (sessions ?? null) : [];
  const error = isError ? "Couldn't load sessions — try again." : null;
  const showSpinner = useDelayedFlag(list === null && !error);

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
        <SessionsListBody list={list} error={error} showSpinner={showSpinner} onSelect={setSelected} />
      </div>
    </Modal>
  );
}
