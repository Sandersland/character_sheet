import { describe, expect, it } from "vitest";

import type { CampaignEntity, EntityMentionRef, EntityStats } from "@/types/character";
import {
  buildLedgerGroups,
  CODEX_SORT_OPTIONS,
  compareByMentionCount,
  compareByRecentMention,
  groupByInitial,
  mergeEntityStats,
  monogram,
  mostMentioned,
  needsChronicling,
  notesSnippet,
  typeCounts,
} from "@/lib/codexLedger";

function entity(partial: Partial<CampaignEntity> & { id: string; name: string }): CampaignEntity {
  return {
    campaignId: "c1",
    type: "NPC",
    aliases: [],
    notes: null,
    visibility: "REVEALED",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

function stats(partial: Partial<EntityStats>): EntityStats {
  return {
    mentionCount: 0,
    firstMentioned: null,
    lastMentioned: null,
    chroniclers: [],
    hasDescription: false,
    ...partial,
  };
}

describe("groupByInitial", () => {
  it("groups by first letter in alphabetical order, sorted within each group", () => {
    const groups = groupByInitial([
      entity({ id: "1", name: "Thordak" }),
      entity({ id: "2", name: "Baldur's Gate" }),
      entity({ id: "3", name: "Goblin Chief" }),
      entity({ id: "4", name: "Bandit Camp" }),
    ]);
    expect(groups.map((g) => g.letter)).toEqual(["B", "G", "T"]);
    expect(groups[0].entities.map((e) => e.name)).toEqual(["Baldur's Gate", "Bandit Camp"]);
  });

  it("buckets non-alphabetic initials under # at the end", () => {
    const groups = groupByInitial([
      entity({ id: "1", name: "42nd Legion" }),
      entity({ id: "2", name: "Aldric" }),
    ]);
    expect(groups.map((g) => g.letter)).toEqual(["A", "#"]);
    expect(groups[1].entities[0].name).toBe("42nd Legion");
  });

  it("folds accented initials onto their base letter", () => {
    const groups = groupByInitial([entity({ id: "1", name: "Élise" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].letter).toBe("E");
  });

  it("returns no groups for an empty list", () => {
    expect(groupByInitial([])).toEqual([]);
  });
});

describe("typeCounts", () => {
  it("counts entities per type, zero-filling missing types", () => {
    const counts = typeCounts([
      entity({ id: "1", name: "A", type: "NPC" }),
      entity({ id: "2", name: "B", type: "NPC" }),
      entity({ id: "3", name: "C", type: "LOCATION" }),
    ]);
    expect(counts.NPC).toBe(2);
    expect(counts.LOCATION).toBe(1);
    expect(counts.FACTION).toBe(0);
    expect(counts.OTHER).toBe(0);
  });
});

describe("notesSnippet", () => {
  it("returns null for null or blank notes", () => {
    expect(notesSnippet(null)).toBeNull();
    expect(notesSnippet("   \n  ")).toBeNull();
  });

  it("returns the first non-empty line, trimmed", () => {
    expect(notesSnippet("  Leads the tribe.  \nSecond line")).toBe("Leads the tribe.");
    expect(notesSnippet("\n\nAfter blank lines")).toBe("After blank lines");
  });
});

describe("monogram", () => {
  it("uppercases the first character of the name", () => {
    expect(monogram("goblin Chief")).toBe("G");
    expect(monogram("Élise")).toBe("É");
  });

  it("falls back for an empty name", () => {
    expect(monogram("   ")).toBe("?");
  });
});

describe("needsChronicling", () => {
  it("keeps only mentioned, descriptionless entities, most-mentioned first", () => {
    const result = needsChronicling([
      entity({ id: "1", name: "Described", stats: stats({ mentionCount: 9, hasDescription: true }) }),
      entity({ id: "2", name: "Quiet", stats: stats({ mentionCount: 0 }) }),
      entity({ id: "3", name: "Busy", stats: stats({ mentionCount: 5 }) }),
      entity({ id: "4", name: "Once", stats: stats({ mentionCount: 1 }) }),
    ]);
    expect(result.map((e) => e.id)).toEqual(["3", "4"]);
  });

  it("excludes entities without stats", () => {
    expect(needsChronicling([entity({ id: "1", name: "No stats" })])).toEqual([]);
  });

  it("returns empty for an empty list", () => {
    expect(needsChronicling([])).toEqual([]);
  });
});

describe("mostMentioned", () => {
  it("takes the top 3 by mention count, dropping zero-mention entities", () => {
    const result = mostMentioned([
      entity({ id: "1", name: "A", stats: stats({ mentionCount: 2 }) }),
      entity({ id: "2", name: "B", stats: stats({ mentionCount: 7 }) }),
      entity({ id: "3", name: "C", stats: stats({ mentionCount: 0 }) }),
      entity({ id: "4", name: "D", stats: stats({ mentionCount: 4 }) }),
      entity({ id: "5", name: "E", stats: stats({ mentionCount: 3 }) }),
    ]);
    expect(result.map((e) => e.id)).toEqual(["2", "4", "5"]);
  });

  it("breaks count ties by name", () => {
    const result = mostMentioned([
      entity({ id: "1", name: "Zeph", stats: stats({ mentionCount: 2 }) }),
      entity({ id: "2", name: "Aldric", stats: stats({ mentionCount: 2 }) }),
    ]);
    expect(result.map((e) => e.name)).toEqual(["Aldric", "Zeph"]);
  });

  it("respects a custom n and ignores statless entities", () => {
    const result = mostMentioned(
      [
        entity({ id: "1", name: "A", stats: stats({ mentionCount: 1 }) }),
        entity({ id: "2", name: "B", stats: stats({ mentionCount: 5 }) }),
        entity({ id: "3", name: "C" }),
      ],
      1,
    );
    expect(result.map((e) => e.id)).toEqual(["2"]);
  });
});

describe("CODEX_SORT_OPTIONS", () => {
  it("offers all three sorts", () => {
    expect(CODEX_SORT_OPTIONS.map((o) => o.value)).toEqual(["alpha", "recent", "mentions"]);
  });
});

function mention(partial: Partial<EntityMentionRef>): EntityMentionRef {
  return { sessionId: null, sessionTitle: null, sessionOrdinal: null, date: "", ...partial };
}

describe("compareByRecentMention", () => {
  it("orders the latest lastMentioned date first", () => {
    const list = [
      entity({ id: "1", name: "Old", stats: stats({ lastMentioned: mention({ date: "2026-07-01" }) }) }),
      entity({ id: "2", name: "New", stats: stats({ lastMentioned: mention({ date: "2026-07-10" }) }) }),
    ];
    expect([...list].sort(compareByRecentMention).map((e) => e.id)).toEqual(["2", "1"]);
  });

  it("breaks same-date ties by session ordinal, descending", () => {
    const list = [
      entity({
        id: "1",
        name: "Early",
        stats: stats({ lastMentioned: mention({ date: "2026-07-10", sessionOrdinal: 2 }) }),
      }),
      entity({
        id: "2",
        name: "Late",
        stats: stats({ lastMentioned: mention({ date: "2026-07-10", sessionOrdinal: 5 }) }),
      }),
    ];
    expect([...list].sort(compareByRecentMention).map((e) => e.id)).toEqual(["2", "1"]);
  });

  it("sorts never-mentioned and statless entities last, alphabetically", () => {
    const list = [
      entity({ id: "1", name: "Zeta no stats" }),
      entity({ id: "2", name: "Alpha unmentioned", stats: stats({}) }),
      entity({ id: "3", name: "Seen", stats: stats({ lastMentioned: mention({ date: "2026-07-01" }) }) }),
    ];
    expect([...list].sort(compareByRecentMention).map((e) => e.id)).toEqual(["3", "2", "1"]);
  });

  it("falls back to name order on fully tied mentions", () => {
    const ref = mention({ date: "2026-07-10", sessionOrdinal: 3 });
    const list = [
      entity({ id: "1", name: "Zeph", stats: stats({ lastMentioned: ref }) }),
      entity({ id: "2", name: "Aldric", stats: stats({ lastMentioned: ref }) }),
    ];
    expect([...list].sort(compareByRecentMention).map((e) => e.id)).toEqual(["2", "1"]);
  });
});

describe("mergeEntityStats", () => {
  it("attaches stats by id, leaving unmatched entities statless", () => {
    const goblin = entity({ id: "1", name: "Goblin" });
    const gate = entity({ id: "2", name: "Gate" });
    const merged = mergeEntityStats(
      [goblin, gate],
      [{ ...goblin, stats: stats({ mentionCount: 3 }) }],
    );
    expect(merged[0].stats?.mentionCount).toBe(3);
    expect(merged[1].stats).toBeUndefined();
  });
});

describe("buildLedgerGroups", () => {
  const list = [
    entity({ id: "1", name: "Aldric", stats: stats({ mentionCount: 1 }) }),
    entity({ id: "2", name: "Zeph", stats: stats({ mentionCount: 5 }) }),
  ];

  it("returns letter groups for the alpha sort", () => {
    expect(buildLedgerGroups(list, "alpha").map((g) => g.letter)).toEqual(["A", "Z"]);
  });

  it("returns one ranked pseudo-group for mention sorts", () => {
    const groups = buildLedgerGroups(list, "mentions");
    expect(groups).toHaveLength(1);
    expect(groups[0].letter).toBe("");
    expect(groups[0].entities.map((e) => e.id)).toEqual(["2", "1"]);
  });
});

describe("compareByMentionCount", () => {
  it("orders by count descending, statless entities counting as zero", () => {
    const list = [
      entity({ id: "1", name: "None" }),
      entity({ id: "2", name: "Few", stats: stats({ mentionCount: 2 }) }),
      entity({ id: "3", name: "Many", stats: stats({ mentionCount: 7 }) }),
    ];
    expect([...list].sort(compareByMentionCount).map((e) => e.id)).toEqual(["3", "2", "1"]);
  });

  it("breaks count ties by normalized name", () => {
    const list = [
      entity({ id: "1", name: "Zeph", stats: stats({ mentionCount: 2 }) }),
      entity({ id: "2", name: "Élise", stats: stats({ mentionCount: 2 }) }),
      entity({ id: "3", name: "Aldric", stats: stats({ mentionCount: 2 }) }),
    ];
    expect([...list].sort(compareByMentionCount).map((e) => e.id)).toEqual(["3", "2", "1"]);
  });
});
