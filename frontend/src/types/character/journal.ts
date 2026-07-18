/**
 * Per-character journal entry wire types.
 */

export type JournalEntryKind = "NOTE" | "ENTRY";

export type EntryVisibility = "PRIVATE" | "CAMPAIGN";

export interface JournalEntry {
  id: string;
  /** ENTRY = full date/body form; NOTE = fast one-line in-session capture. */
  kind: JournalEntryKind;
  /** ISO-8601 date string from the API (the JournalEntry.date DateTime). */
  date: string;
  /** ISO-8601 capture timestamp shown on NOTE rows (JournalEntry.loggedAt). */
  loggedAt: string;
  body: string;
  /** CAMPAIGN notes surface on entity backlinks; PRIVATE is author-only (#838). */
  visibility: EntryVisibility;
  /** Provenance: the session this entry was written during, if any. */
  sessionId?: string;
}
