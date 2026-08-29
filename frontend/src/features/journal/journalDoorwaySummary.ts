// Sessions arrive newest-first from fetchChronicleSessions.
import type { ChronicleSession, JournalEntry } from "@/types/character";

export interface JournalDoorwaySummary {
  isEmpty: boolean;
  noteCount: number;
  chapterCount: number;
  currentChapterTitle: string | null;
  lastWrittenAt: string | null;
}

function sessionTitle(session: ChronicleSession): string {
  return session.title?.trim() ? session.title.trim() : `Session ${session.sessionNumber}`;
}

export function summarizeJournalDoorway(
  journal: JournalEntry[],
  sessions: ChronicleSession[],
): JournalDoorwaySummary {
  const noteCount = journal.length;
  const chapterCount = sessions.length;

  const newest = sessions[0];
  const currentChapterTitle = newest ? sessionTitle(newest) : null;

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
