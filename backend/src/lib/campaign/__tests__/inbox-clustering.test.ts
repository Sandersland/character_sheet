import { describe, expect, it } from "vitest";

import {
  buildDuplicateClusters,
  buildMergeExclusionSet,
  clusterSignature,
  editDistance,
  isDuplicatePair,
  pickDefaultSurvivor,
  type ClusterableEntity,
} from "@/lib/campaign/inbox-clustering.js";

describe("editDistance", () => {
  it("is zero for identical strings", () => {
    expect(editDistance("lili", "lili")).toBe(0);
  });

  it("counts a single substitution", () => {
    expect(editDistance("lili", "lila")).toBe(1);
  });

  it("counts a single insertion/deletion", () => {
    expect(editDistance("lil", "lili")).toBe(1);
  });

  it("handles empty strings", () => {
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("abc", "")).toBe(3);
  });
});

describe("isDuplicatePair", () => {
  it("matches names that fold to the same normalized key", () => {
    expect(isDuplicatePair("Lil", "lil")).toBe(true);
  });

  it("unions names >=4 folded chars apart by edit distance <= 2", () => {
    expect(isDuplicatePair("Lili", "Lilli")).toBe(true);
    expect(isDuplicatePair("Aramil", "Aramyl")).toBe(true);
  });

  it("rejects names >=4 folded chars apart by edit distance > 2", () => {
    expect(isDuplicatePair("Aramil", "Zorblatt")).toBe(false);
  });

  it("unions names <4 folded chars apart by edit distance <= 1 only", () => {
    expect(isDuplicatePair("Lil", "Lyl")).toBe(true);
  });

  it("rejects names <4 folded chars apart by edit distance > 1", () => {
    expect(isDuplicatePair("Lil", "Zaz")).toBe(false);
  });

  it("uses the shorter folded name's length for the threshold", () => {
    // "Vex" (3 chars) vs "Vexara" (6 chars): shorter side is <4, so threshold is 1.
    // Distance between "vex" and "vexara" is 3 (three insertions) -> no match.
    expect(isDuplicatePair("Vex", "Vexara")).toBe(false);
  });
});

// #1945 review: unbounded distance pairing false-positived on any two
// single-letter names, and on a differing trailing number ("Guard 1"/"Guard
// 2" are 1 apart, well within threshold).
describe("isDuplicatePair — digit-conflict guard", () => {
  it("never pairs names whose digit runs differ, however close by distance", () => {
    expect(isDuplicatePair("Guard 1", "Guard 2")).toBe(false);
    expect(isDuplicatePair("Guard 1", "Guard 3")).toBe(false);
    expect(isDuplicatePair("Room 101", "Room 102")).toBe(false);
  });

  it("does not block a genuine typo that carries the SAME digits", () => {
    expect(isDuplicatePair("Room 101", "Rom 101")).toBe(true);
  });

  it("leaves a distance match alone when neither name has digits", () => {
    expect(isDuplicatePair("Aramil", "Aramyl")).toBe(true);
  });
});

describe("isDuplicatePair — short-name guard", () => {
  it("never pairs two different single-letter names by distance alone", () => {
    expect(isDuplicatePair("A", "B")).toBe(false);
    expect(isDuplicatePair("X", "Y")).toBe(false);
  });

  it("still matches an EXACT single-letter fold", () => {
    expect(isDuplicatePair("A", "a")).toBe(true);
  });
});

describe("buildMergeExclusionSet", () => {
  it("produces one order-independent entry per merge pair", () => {
    const set = buildMergeExclusionSet([{ mergedEntityId: "petarus", survivorEntityId: "potaras" }]);
    expect(set.size).toBe(1);
  });
});

describe("buildDuplicateClusters", () => {
  const noExclusions = new Set<string>();

  it("unions a transitive chain of near-duplicate names into one cluster", () => {
    const entities: ClusterableEntity[] = [
      { id: "1", name: "Lil" },
      { id: "2", name: "lili" },
      { id: "3", name: "Lili" },
    ];
    const clusters = buildDuplicateClusters(entities, noExclusions);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].sort()).toEqual(["1", "2", "3"]);
  });

  it("leaves unrelated names as singleton clusters (dropped from the result)", () => {
    const entities: ClusterableEntity[] = [
      { id: "1", name: "Lil" },
      { id: "2", name: "Gorgo" },
    ];
    expect(buildDuplicateClusters(entities, noExclusions)).toEqual([]);
  });

  it("excludes a pair linked by any CampaignEntityMerge, regardless of status", () => {
    // Petarus/Potaras ARE within edit-distance-2 of each other (2
    // substitutions, folded length 7) — without the merge exclusion they'd
    // cluster; the identity merge is what suppresses the flag (#387).
    const entities: ClusterableEntity[] = [
      { id: "petarus", name: "Petarus" },
      { id: "potaras", name: "Potaras" },
    ];
    expect(buildDuplicateClusters(entities, noExclusions)).toEqual([
      ["petarus", "potaras"],
    ]);

    const exclusionSet = buildMergeExclusionSet([
      { mergedEntityId: "petarus", survivorEntityId: "potaras" },
    ]);
    expect(buildDuplicateClusters(entities, exclusionSet)).toEqual([]);
  });

  it("forms separate clusters for unrelated near-duplicate groups", () => {
    const entities: ClusterableEntity[] = [
      { id: "1", name: "Lil" },
      { id: "2", name: "Lili" },
      { id: "3", name: "Gorgo" },
      { id: "4", name: "Gorga" },
    ];
    const clusters = buildDuplicateClusters(entities, noExclusions).map((c) => c.sort());
    expect(clusters).toHaveLength(2);
    expect(clusters).toContainEqual(["1", "2"]);
    expect(clusters).toContainEqual(["3", "4"]);
  });

  // #1945 review: the blocker-grade product trap — a DM's "Guard 1/Guard
  // 2/Guard 3" or "Room 101/Room 102" naming scheme must never surface a
  // destructive one-click combine offer.
  it("never clusters Guard 1/Guard 2/Guard 3 despite each pair being distance 1 apart", () => {
    const entities: ClusterableEntity[] = [
      { id: "1", name: "Guard 1" },
      { id: "2", name: "Guard 2" },
      { id: "3", name: "Guard 3" },
    ];
    expect(buildDuplicateClusters(entities, noExclusions)).toEqual([]);
  });

  it("never clusters Room 101/Room 102", () => {
    const entities: ClusterableEntity[] = [
      { id: "1", name: "Room 101" },
      { id: "2", name: "Room 102" },
    ];
    expect(buildDuplicateClusters(entities, noExclusions)).toEqual([]);
  });

  it("still clusters a genuine typo pair that carries the same digits", () => {
    const entities: ClusterableEntity[] = [
      { id: "1", name: "Room 101" },
      { id: "2", name: "Rom 101" },
    ];
    expect(buildDuplicateClusters(entities, noExclusions)[0].sort()).toEqual(["1", "2"]);
  });
});

describe("clusterSignature", () => {
  it("is stable regardless of input order", () => {
    expect(clusterSignature(["b", "a", "c"])).toBe(clusterSignature(["a", "b", "c"]));
  });

  it("changes when membership changes", () => {
    expect(clusterSignature(["a", "b"])).not.toBe(clusterSignature(["a", "b", "c"]));
  });
});

describe("pickDefaultSurvivor", () => {
  it("picks the most-mentioned entity", () => {
    const id = pickDefaultSurvivor([
      { id: "a", mentionCount: 1, createdAt: new Date("2024-01-01") },
      { id: "b", mentionCount: 5, createdAt: new Date("2024-01-02") },
      { id: "c", mentionCount: 2, createdAt: new Date("2024-01-03") },
    ]);
    expect(id).toBe("b");
  });

  it("breaks a mention-count tie by oldest createdAt", () => {
    const id = pickDefaultSurvivor([
      { id: "newer", mentionCount: 3, createdAt: new Date("2024-06-01") },
      { id: "older", mentionCount: 3, createdAt: new Date("2024-01-01") },
    ]);
    expect(id).toBe("older");
  });
});
