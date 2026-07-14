import { describe, it, expect } from "vitest";

import { summarizeJournalDoorway } from "@/features/journal/journalDoorwaySummary";
import type { ChronicleSession, JournalEntry } from "@/types/character";

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: "e1",
    kind: "NOTE",
    date: "2026-06-20T00:00:00.000Z",
    loggedAt: "2026-06-20T12:00:00.000Z",
    body: "A note.",
    visibility: "PRIVATE",
    ...overrides,
  };
}

function session(overrides: Partial<ChronicleSession> = {}): ChronicleSession {
  return {
    id: "s1",
    campaignId: "camp-1",
    status: "COMPLETED",
    startedAt: "2026-06-20T00:00:00.000Z",
    sessionNumber: 1,
    noteCount: 0,
    ...overrides,
  } as ChronicleSession;
}

describe("summarizeJournalDoorway", () => {
  it("reports empty when there are no entries", () => {
    const summary = summarizeJournalDoorway([], []);
    expect(summary.isEmpty).toBe(true);
    expect(summary.noteCount).toBe(0);
    expect(summary.chapterCount).toBe(0);
    expect(summary.currentChapterTitle).toBeNull();
    expect(summary.lastWrittenAt).toBeNull();
  });

  it("counts notes and chapters", () => {
    const summary = summarizeJournalDoorway(
      [entry({ id: "a" }), entry({ id: "b" })],
      [session({ id: "s2", sessionNumber: 2 }), session({ id: "s1", sessionNumber: 1 })],
    );
    expect(summary.isEmpty).toBe(false);
    expect(summary.noteCount).toBe(2);
    expect(summary.chapterCount).toBe(2);
  });

  it("uses the newest session's title as the current chapter", () => {
    const summary = summarizeJournalDoorway(
      [entry()],
      [session({ id: "s2", sessionNumber: 2, title: "The Sunken Vault" })],
    );
    expect(summary.currentChapterTitle).toBe("The Sunken Vault");
  });

  it('falls back to "Session N" for an untitled newest session', () => {
    const summary = summarizeJournalDoorway(
      [entry()],
      [session({ id: "s3", sessionNumber: 3, title: null })],
    );
    expect(summary.currentChapterTitle).toBe("Session 3");
  });

  it("has no current chapter for a campaign-less character (no sessions)", () => {
    const summary = summarizeJournalDoorway([entry()], []);
    expect(summary.chapterCount).toBe(0);
    expect(summary.currentChapterTitle).toBeNull();
  });

  it("takes the most recent loggedAt as last-written", () => {
    const summary = summarizeJournalDoorway(
      [
        entry({ id: "old", loggedAt: "2026-06-01T00:00:00.000Z" }),
        entry({ id: "new", loggedAt: "2026-06-22T09:30:00.000Z" }),
      ],
      [],
    );
    expect(summary.lastWrittenAt).toBe("2026-06-22T09:30:00.000Z");
  });
});
