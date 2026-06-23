import { afterEach, describe, expect, it, vi } from "vitest";

import { formatBatchDate, groupByBatch, groupByDate } from "./timeline";

// A fixed "now" so "Today" detection is deterministic.
const NOW = new Date("2026-06-22T12:00:00Z");

function at(iso: string) {
  return { createdAt: iso };
}

describe("formatBatchDate", () => {
  afterEach(() => vi.useRealTimers());

  it("labels same-day timestamps as Today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(formatBatchDate("2026-06-22T08:30:00Z")).toBe("Today");
  });

  it("labels other days with month + day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(formatBatchDate("2026-06-21T08:30:00Z")).toBe("Jun 21");
  });
});

describe("groupByDate", () => {
  afterEach(() => vi.useRealTimers());

  it("collapses consecutive same-date items under one section", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const items = [
      at("2026-06-22T11:00:00Z"), // Today
      at("2026-06-22T09:00:00Z"), // Today
      at("2026-06-21T18:00:00Z"), // Jun 21
      at("2026-06-19T10:00:00Z"), // Jun 19
    ];

    const sections = groupByDate(items);

    expect(sections.map((s) => s.label)).toEqual(["Today", "Jun 21", "Jun 19"]);
    expect(sections[0].items).toHaveLength(2);
    expect(sections[1].items).toHaveLength(1);
    expect(sections[2].items).toHaveLength(1);
  });

  it("preserves newest-first order within and across sections", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const items = [
      at("2026-06-22T11:00:00Z"),
      at("2026-06-22T09:00:00Z"),
      at("2026-06-21T18:00:00Z"),
    ];

    const sections = groupByDate(items);
    expect(sections[0].items.map((i) => i.createdAt)).toEqual([
      "2026-06-22T11:00:00Z",
      "2026-06-22T09:00:00Z",
    ]);
    // Section header reflects the first (newest) item of the group.
    expect(sections[0].createdAt).toBe("2026-06-22T11:00:00Z");
  });

  it("returns an empty list for no items", () => {
    expect(groupByDate([])).toEqual([]);
  });

  it("composes with groupByBatch (one date header per day of batches)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const events = [
      { id: "a", batchId: "b1", createdAt: "2026-06-22T11:00:00Z" },
      { id: "b", batchId: "b1", createdAt: "2026-06-22T11:00:00Z" },
      { id: "c", batchId: "b2", createdAt: "2026-06-22T09:00:00Z" },
      { id: "d", batchId: "b3", createdAt: "2026-06-21T18:00:00Z" },
    ];

    const batches = groupByBatch(events);
    const sections = groupByDate(batches);

    expect(sections.map((s) => s.label)).toEqual(["Today", "Jun 21"]);
    // Two distinct batches share "Today".
    expect(sections[0].items.map((b) => b.key)).toEqual(["b1", "b2"]);
    expect(sections[1].items.map((b) => b.key)).toEqual(["b3"]);
  });
});
