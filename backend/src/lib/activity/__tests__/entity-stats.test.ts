import { describe, expect, it } from "vitest";

import type { MergeEdge } from "@/lib/activity/entity-merges.js";
import {
  aggregateEntityStats,
  buildSessionOrdinalMap,
  matchEntityQuery,
  resolveVisibleMergeUnion,
  tallyCoMentions,
  visibleEntryWhere,
  type StatRef,
} from "@/lib/activity/entity-stats.js";

function ref(overrides: Partial<StatRef> & { entityId: string; entryId: string }): StatRef {
  return {
    characterName: "Alice",
    sessionId: null,
    date: new Date("2026-07-01T00:00:00Z"),
    loggedAt: new Date("2026-07-01T00:00:00Z"),
    createdAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

describe("visibleEntryWhere", () => {
  it("builds the #838 own-or-CAMPAIGN OR fragment", () => {
    expect(visibleEntryWhere("user-1", "camp-1")).toEqual({
      OR: [
        { authorUserId: "user-1" },
        { visibility: "CAMPAIGN", character: { campaignId: "camp-1" } },
      ],
    });
  });
});

describe("buildSessionOrdinalMap", () => {
  it("assigns 1-based ordinals in input order", () => {
    const map = buildSessionOrdinalMap([{ id: "s-a" }, { id: "s-b" }, { id: "s-c" }]);
    expect(map.get("s-a")).toBe(1);
    expect(map.get("s-b")).toBe(2);
    expect(map.get("s-c")).toBe(3);
    expect(map.get("s-missing")).toBeUndefined();
  });

  it("is empty for no sessions", () => {
    expect(buildSessionOrdinalMap([]).size).toBe(0);
  });
});

describe("aggregateEntityStats", () => {
  it("counts distinct entries and folds merged identities into the survivor once", () => {
    const survivorOf = new Map([
      ["jenkins", "vecna"],
      ["vecna", "vecna"],
    ]);
    // Entry e-1 dual-tags both identities: must count once for the survivor.
    const stats = aggregateEntityStats(
      [
        ref({ entityId: "vecna", entryId: "e-1" }),
        ref({ entityId: "jenkins", entryId: "e-1" }),
        ref({ entityId: "jenkins", entryId: "e-2" }),
      ],
      { survivorOf },
    );
    expect(stats.get("vecna")!.mentionCount).toBe(2);
  });

  it("dedupes chroniclers while preserving distinct authors", () => {
    const stats = aggregateEntityStats([
      ref({ entityId: "npc", entryId: "e-1", characterName: "Alice" }),
      ref({ entityId: "npc", entryId: "e-2", characterName: "Alice" }),
      ref({ entityId: "npc", entryId: "e-3", characterName: "Bob" }),
    ]);
    expect(stats.get("npc")!.chroniclers).toEqual(["Alice", "Bob"]);
  });

  it("picks first/last by date, then loggedAt, then createdAt", () => {
    const early = ref({
      entityId: "npc",
      entryId: "e-early",
      date: new Date("2026-06-01T00:00:00Z"),
    });
    // Same date as e-tie-late; loggedAt breaks the tie.
    const tieEarly = ref({
      entityId: "npc",
      entryId: "e-tie-early",
      date: new Date("2026-07-01T00:00:00Z"),
      loggedAt: new Date("2026-07-01T10:00:00Z"),
    });
    const tieLate = ref({
      entityId: "npc",
      entryId: "e-tie-late",
      date: new Date("2026-07-01T00:00:00Z"),
      loggedAt: new Date("2026-07-01T12:00:00Z"),
    });
    const stats = aggregateEntityStats([tieLate, early, tieEarly]);
    expect(stats.get("npc")!.firstMentioned!.entryId).toBe("e-early");
    expect(stats.get("npc")!.lastMentioned!.entryId).toBe("e-tie-late");
  });

  it("returns no aggregate for an unmentioned entity", () => {
    expect(aggregateEntityStats([]).get("ghost")).toBeUndefined();
  });
});

describe("resolveVisibleMergeUnion", () => {
  const edges: MergeEdge[] = [
    { mergedEntityId: "jenkins", survivorEntityId: "vecna", status: "EXECUTED" },
    { mergedEntityId: "cultist", survivorEntityId: "vecna", status: "EXECUTED" },
    { mergedEntityId: "oldman", survivorEntityId: "vecna", status: "PREPARED" },
  ];

  it("gives the owner the full EXECUTED union per survivor", () => {
    const union = resolveVisibleMergeUnion(edges, ["vecna", "other"], new Set(), true);
    expect(union.get("vecna")!.sort()).toEqual(["cultist", "jenkins"]);
    expect(union.get("other")).toEqual([]);
  });

  it("scrubs HIDDEN merged identities for non-owners", () => {
    const union = resolveVisibleMergeUnion(edges, ["vecna"], new Set(["jenkins"]), false);
    expect(union.get("vecna")).toEqual(["jenkins"]);
  });
});

describe("tallyCoMentions", () => {
  const edges: MergeEdge[] = [
    { mergedEntityId: "old", survivorEntityId: "true-id", status: "EXECUTED" },
  ];
  const entityById = new Map([
    ["target", { id: "target", name: "Target", visibility: "REVEALED" }],
    ["old", { id: "old", name: "Old", visibility: "REVEALED" }],
    ["true-id", { id: "true-id", name: "True", visibility: "REVEALED" }],
    ["ally", { id: "ally", name: "Ally", visibility: "REVEALED" }],
    ["ghost", { id: "ghost", name: "Ghost", visibility: "HIDDEN" }],
  ]);
  const targetIds = new Set(["target"]);

  it("counts distinct entries per survivor sorted desc, excluding the target", () => {
    const tally = tallyCoMentions(
      [
        { entryId: "e-1", entityId: "target" },
        { entryId: "e-1", entityId: "ally" },
        { entryId: "e-2", entityId: "ally" },
        { entryId: "e-1", entityId: "old" },
        { entryId: "e-1", entityId: "true-id" },
      ],
      { edges, entityById, targetIds, isOwner: true },
    );
    expect(tally.map((t) => [t.entity.id, t.count])).toEqual([
      ["ally", 2],
      ["true-id", 1],
    ]);
  });

  it("scrubs HIDDEN co-mentions for non-owners but keeps them for the owner", () => {
    const refs = [
      { entryId: "e-1", entityId: "target" },
      { entryId: "e-1", entityId: "ghost" },
    ];
    expect(tallyCoMentions(refs, { edges, entityById, targetIds, isOwner: false })).toEqual([]);
    expect(
      tallyCoMentions(refs, { edges, entityById, targetIds, isOwner: true })[0].entity.id,
    ).toBe("ghost");
  });
});

describe("matchEntityQuery", () => {
  const entity = {
    name: "Baldur's Gate",
    aliases: ["The Gate"],
    notes: "A bustling port city on the Sword Coast",
  };

  it("matches name first even when notes also match", () => {
    expect(matchEntityQuery({ ...entity, notes: "gate of the city" }, "gate")).toBe("name");
  });

  it("matches alias before notes", () => {
    const e = { name: "Elturel", aliases: ["The Gate"], notes: "near the gate" };
    expect(matchEntityQuery(e, "gate")).toBe("alias");
  });

  it("matches notes content", () => {
    expect(matchEntityQuery(entity, "sword coast")).toBe("notes");
  });

  it("normalizes diacritics and punctuation", () => {
    expect(matchEntityQuery(entity, "baldurs")).toBe("name");
    expect(matchEntityQuery({ name: "Château Noir", aliases: [], notes: null }, "chateau")).toBe(
      "name",
    );
  });

  it("returns null for no match or a blank query", () => {
    expect(matchEntityQuery(entity, "waterdeep")).toBeNull();
    expect(matchEntityQuery(entity, "   ")).toBeNull();
    expect(matchEntityQuery({ name: "X", aliases: [], notes: null }, "sword")).toBeNull();
  });
});
