import { describe, it, expect } from "vitest";

import { formatDuration, formatTimeRange, sortSlotsSpent, withSummary } from "@/lib/sessionRecap";
import type { ParticipantSummary, SessionParticipant } from "@/types/character";

describe("formatDuration", () => {
  it("renders minutes only under an hour", () => {
    expect(formatDuration(25 * 60_000)).toBe("25 min");
  });

  it("renders whole hours with no trailing minutes", () => {
    expect(formatDuration(2 * 60 * 60_000)).toBe("2 hr");
  });

  it("renders hours and minutes together", () => {
    expect(formatDuration(90 * 60_000)).toBe("1 hr 30 min");
  });

  it("renders 0 min for a zero-length window", () => {
    expect(formatDuration(0)).toBe("0 min");
  });
});

describe("formatTimeRange", () => {
  it("joins the start date with a start–end time range", () => {
    const out = formatTimeRange("2026-06-22T18:00:00.000Z", "2026-06-22T21:30:00.000Z");
    expect(out).toContain("–");
    expect(out).toMatch(/,/);
  });
});

describe("sortSlotsSpent", () => {
  it("drops zero counts and sorts ascending by level", () => {
    expect(sortSlotsSpent({ "3": 1, "1": 2, "2": 0 })).toEqual([
      ["1", 2],
      ["3", 1],
    ]);
  });

  it("returns an empty array when nothing was spent", () => {
    expect(sortSlotsSpent({})).toEqual([]);
    expect(sortSlotsSpent({ "1": 0 })).toEqual([]);
  });
});

describe("withSummary", () => {
  const summary = { characterId: "c1", characterName: "Aldric" } as ParticipantSummary;

  it("keeps only participants carrying a computed summary", () => {
    const participants = [
      { id: "p1", characterId: "c1", summary } as SessionParticipant,
      { id: "p2", characterId: "c2", summary: null } as unknown as SessionParticipant,
    ];
    const kept = withSummary(participants);
    expect(kept).toHaveLength(1);
    expect(kept[0].summary).toBe(summary);
  });

  it("returns an empty array when no participant has a summary", () => {
    expect(withSummary([])).toEqual([]);
  });
});
