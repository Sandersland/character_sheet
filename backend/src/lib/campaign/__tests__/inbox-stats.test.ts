import { describe, expect, it } from "vitest";

import { buildSurvivorMap, foldMentionStats } from "@/lib/campaign/inbox-stats.js";
import type { MergeEdge } from "@/lib/activity/entity-merges.js";

describe("buildSurvivorMap", () => {
  it("maps a merged identity to its EXECUTED survivor", () => {
    const edges: MergeEdge[] = [
      { mergedEntityId: "jenkins", survivorEntityId: "vecna", status: "EXECUTED" },
    ];
    const map = buildSurvivorMap(edges, ["jenkins", "vecna"]);
    expect(map.get("jenkins")).toBe("vecna");
    expect(map.has("vecna")).toBe(false);
  });

  it("resolves a transitive chain to the FINAL survivor", () => {
    const edges: MergeEdge[] = [
      { mergedEntityId: "jenkins", survivorEntityId: "vecna", status: "EXECUTED" },
      { mergedEntityId: "vecna", survivorEntityId: "whispered", status: "EXECUTED" },
    ];
    const map = buildSurvivorMap(edges, ["jenkins"]);
    expect(map.get("jenkins")).toBe("whispered");
  });

  it("leaves a PREPARED-only merge unmapped — not yet a real survivor", () => {
    const edges: MergeEdge[] = [
      { mergedEntityId: "oldman", survivorEntityId: "vecna", status: "PREPARED" },
    ];
    const map = buildSurvivorMap(edges, ["oldman"]);
    expect(map.has("oldman")).toBe(false);
  });

  it("leaves an unmerged entity unmapped", () => {
    const map = buildSurvivorMap([], ["standalone"]);
    expect(map.has("standalone")).toBe(false);
  });
});

describe("foldMentionStats", () => {
  it("counts refs and tracks the latest date per entity", () => {
    const stats = foldMentionStats(
      [
        { entityId: "a", date: new Date("2024-01-01") },
        { entityId: "a", date: new Date("2024-03-01") },
        { entityId: "b", date: new Date("2024-02-01") },
      ],
      new Map(),
    );
    expect(stats.get("a")).toEqual({ mentionCount: 2, lastMentionedAt: new Date("2024-03-01") });
    expect(stats.get("b")).toEqual({ mentionCount: 1, lastMentionedAt: new Date("2024-02-01") });
  });

  it("redirects a merged-away identity's refs onto its survivor", () => {
    const survivorOf = new Map([["oldSergeant", "guardCaptain"]]);
    const stats = foldMentionStats(
      [
        { entityId: "oldSergeant", date: new Date("2024-01-01") },
        { entityId: "oldSergeant", date: new Date("2024-01-02") },
        { entityId: "guardCaptain", date: new Date("2024-06-01") },
      ],
      survivorOf,
    );
    expect(stats.has("oldSergeant")).toBe(false);
    expect(stats.get("guardCaptain")).toEqual({
      mentionCount: 3,
      lastMentionedAt: new Date("2024-06-01"),
    });
  });

  it("an out-of-date-order ref stream still finds the true max date", () => {
    const stats = foldMentionStats(
      [
        { entityId: "a", date: new Date("2024-06-01") },
        { entityId: "a", date: new Date("2024-01-01") },
      ],
      new Map(),
    );
    expect(stats.get("a")?.lastMentionedAt).toEqual(new Date("2024-06-01"));
  });
});
