import { describe, expect, it } from "vitest";

import {
  buildDuplicateClusters,
  buildMergeExclusionSet,
  clusterSignature,
  editDistance,
  isDuplicatePair,
  pairKey,
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

describe("pairKey", () => {
  it("is order-independent", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
  });

  it("distinguishes different pairs", () => {
    expect(pairKey("a", "b")).not.toBe(pairKey("a", "c"));
  });
});

describe("buildMergeExclusionSet", () => {
  it("keys every merge pair regardless of status", () => {
    const set = buildMergeExclusionSet([
      { mergedEntityId: "petarus", survivorEntityId: "potaras" },
    ]);
    expect(set.has(pairKey("petarus", "potaras"))).toBe(true);
    expect(set.has(pairKey("potaras", "petarus"))).toBe(true);
  });
});

describe("buildDuplicateClusters", () => {
  const noExclusions = () => false;

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
    const isExcludedPair = (a: string, b: string) => exclusionSet.has(pairKey(a, b));
    expect(buildDuplicateClusters(entities, isExcludedPair)).toEqual([]);
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
