export type JournalEntryKind = "NOTE" | "ENTRY";

export type EntryVisibility = "PRIVATE" | "CAMPAIGN";

export interface JournalEntry {
  id: string;
  /** ENTRY = full date/body form; NOTE = fast one-line in-session capture. */
  kind: JournalEntryKind;
  /** ISO-8601 date string. */
  date: string;
  /** ISO-8601 capture timestamp shown on NOTE rows. */
  loggedAt: string;
  body: string;
  /** CAMPAIGN notes surface on entity backlinks; PRIVATE is author-only. */
  visibility: EntryVisibility;
  sessionId?: string;
}
