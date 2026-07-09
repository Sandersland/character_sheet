import { useEffect, useState } from "react";

import { fetchSession } from "@/api/client";
import { withSummary, type SummarizedParticipant } from "@/lib/sessionRecap";
import type { CampaignRecap, JournalEntry, Session } from "@/types/character";

interface SessionRecapDetail {
  recap: CampaignRecap | null | undefined;
  participants: SummarizedParticipant[];
  journalEntries: JournalEntry[];
  applyRefreshed: (full: Session) => void;
}

// Holds the recap/participants/journals shown in the summary modal, lazily
// fetching full detail when the session was seeded from a list (SessionsModal
// carries no journals/summaries); the end-session path already supplies them.
export function useSessionRecapDetail(characterId: string, session: Session): SessionRecapDetail {
  const [recap, setRecap] = useState<CampaignRecap | null | undefined>(session.summary);
  const [participants, setParticipants] = useState<SummarizedParticipant[]>(
    withSummary(session.participants ?? []),
  );
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(
    session.journalEntries ?? [],
  );

  useEffect(() => {
    if (session.journalEntries !== undefined) return;
    let cancelled = false;
    fetchSession(characterId, session.id)
      .then((full) => {
        if (cancelled) return;
        setJournalEntries(full.journalEntries ?? []);
        setParticipants(withSummary(full.participants ?? []));
        setRecap(full.summary);
      })
      .catch(() => {
        /* leave the seeded data in place if detail fetch fails */
      });
    return () => {
      cancelled = true;
    };
  }, [characterId, session.id, session.journalEntries]);

  function applyRefreshed(full: Session) {
    setRecap(full.summary);
    setParticipants(withSummary(full.participants ?? []));
    if (full.journalEntries !== undefined) setJournalEntries(full.journalEntries);
  }

  return { recap, participants, journalEntries, applyRefreshed };
}
