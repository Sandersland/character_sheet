import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { formatJournalDate, formatRelativeDay } from "@/lib/formatJournalDate";

describe("formatJournalDate", () => {
  it("formats a valid ISO date in UTC (numeric year, short month, numeric day)", () => {
    expect(formatJournalDate("2026-06-22T00:00:00.000Z")).toBe("Jun 22, 2026");
  });

  it("does not shift the day backwards for a UTC-midnight date", () => {
    // Formatted in UTC, so the calendar day must be preserved regardless of the
    // host timezone.
    expect(formatJournalDate("2026-01-01T00:00:00.000Z")).toBe("Jan 1, 2026");
  });

  it("returns the raw input unchanged when it is not a parseable date", () => {
    expect(formatJournalDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatRelativeDay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T15:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says today for the current UTC day", () => {
    expect(formatRelativeDay("2026-07-12T00:00:00.000Z")).toBe("today");
  });

  it("says yesterday for one UTC calendar day back", () => {
    expect(formatRelativeDay("2026-07-11T00:00:00.000Z")).toBe("yesterday");
  });

  it("counts calendar days ago", () => {
    expect(formatRelativeDay("2026-07-05T00:00:00.000Z")).toBe("7 days ago");
    expect(formatRelativeDay("2026-07-10T00:00:00.000Z")).toBe("2 days ago");
  });

  it("diffs UTC calendar days, not elapsed 24h windows", () => {
    // Less than 24h before now, but the previous UTC day → yesterday.
    expect(formatRelativeDay("2026-07-11T23:59:00.000Z")).toBe("yesterday");
  });

  it("falls back to the absolute date past 30 days", () => {
    expect(formatRelativeDay("2026-06-12T00:00:00.000Z")).toBe("30 days ago");
    expect(formatRelativeDay("2026-06-11T00:00:00.000Z")).toBe("Jun 11, 2026");
  });

  it("treats a future date as today rather than counting negatively", () => {
    expect(formatRelativeDay("2026-07-13T00:00:00.000Z")).toBe("today");
  });

  it("returns unparseable input verbatim", () => {
    expect(formatRelativeDay("not-a-date")).toBe("not-a-date");
  });
});
