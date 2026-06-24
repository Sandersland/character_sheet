import { describe, it, expect } from "vitest";

import { formatJournalDate } from "@/lib/formatJournalDate";

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
