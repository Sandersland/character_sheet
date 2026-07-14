// Pure summary model for the sheet's journal doorway card (#867). The sheet no
// longer edits the journal — it shows a closed-book card that opens the chronicle
// page. This distills the character's journal + the campaign's chronicle sessions
// into the four facts the card renders: how many notes, how many chapters, the
// current (newest) chapter's title, and when the journal was last written to.
//
// Sessions arrive newest-first from fetchChronicleSessions; a campaign-less
// character has none, so `chapterCount` is 0 and `currentChapterTitle` is null.

import type { ChronicleSession, JournalEntry } from "@/types/character";

export interface JournalDoorwaySummary {
  /** No journal entries yet — the card shows the "begin your chronicle" state. */
  isEmpty: boolean;
  noteCount: number;
  chapterCount: number;
  /** Newest session's title / "Session N", or null when there are no sessions. */
  currentChapterTitle: string | null;
  /** ISO timestamp of the most-recently-written entry, or null when empty. */
  lastWrittenAt: string | null;
}

/** Title of a session for the doorway: trimmed title, else "Session N". */
function sessionTitle(session: ChronicleSession): string {
  return session.title?.trim() ? session.title.trim() : `Session ${session.sessionNumber}`;
}

export function summarizeJournalDoorway(
  journal: JournalEntry[],
  sessions: ChronicleSession[],
): JournalDoorwaySummary {
  const noteCount = journal.length;
  const chapterCount = sessions.length;

  // Sessions are newest-first; the head is the current chapter.
  const newest = sessions[0];
  const currentChapterTitle = newest ? sessionTitle(newest) : null;

  // Most recent write = latest loggedAt (falling back to the entry date).
  let lastWrittenAt: string | null = null;
  for (const entry of journal) {
    const stamp = entry.loggedAt ?? entry.date;
    if (!lastWrittenAt || new Date(stamp).getTime() > new Date(lastWrittenAt).getTime()) {
      lastWrittenAt = stamp;
    }
  }

  return {
    isEmpty: noteCount === 0,
    noteCount,
    chapterCount,
    currentChapterTitle,
    lastWrittenAt,
  };
}
