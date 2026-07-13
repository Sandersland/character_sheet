import { describe, expect, it } from "vitest";

import type { CampaignEntity } from "@/types/character";
import {
  CODEX_SORT_OPTIONS,
  groupByInitial,
  monogram,
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

describe("CODEX_SORT_OPTIONS", () => {
  it("enables only the alphabetical sort until mention stats land", () => {
    const enabled = CODEX_SORT_OPTIONS.filter((o) => !o.disabled).map((o) => o.value);
    expect(enabled).toEqual(["alpha"]);
    expect(CODEX_SORT_OPTIONS.map((o) => o.value)).toEqual(["alpha", "recent", "mentions"]);
  });
});
