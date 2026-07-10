import { describe, expect, it } from "vitest";

import {
  collectMergedInIdentities,
  resolveSurvivorChain,
  wouldCreateCycle,
  type MergeEdge,
} from "@/lib/campaign/entity-merges.js";

// Jenkins → Vecna → Whispered One, plus a second identity (Oldman) merged into
// Vecna. One edge (Oldman→Vecna) is only PREPARED to exercise the filter.
const merges: MergeEdge[] = [
  { mergedEntityId: "jenkins", survivorEntityId: "vecna", status: "EXECUTED" },
  { mergedEntityId: "vecna", survivorEntityId: "whispered", status: "EXECUTED" },
  { mergedEntityId: "oldman", survivorEntityId: "vecna", status: "PREPARED" },
];

describe("resolveSurvivorChain", () => {
  it("walks the full transitive chain nearest-first", () => {
    expect(resolveSurvivorChain(merges, "jenkins")).toEqual(["vecna", "whispered"]);
  });

  it("returns empty for an entity that is not a merged identity", () => {
    expect(resolveSurvivorChain(merges, "whispered")).toEqual([]);
  });

  it("respects executedOnly (a PREPARED edge is not followed)", () => {
    expect(resolveSurvivorChain(merges, "oldman", { executedOnly: true })).toEqual([]);
    expect(resolveSurvivorChain(merges, "oldman")).toEqual(["vecna", "whispered"]);
  });

  it("terminates on a malformed cycle instead of looping", () => {
    const cyclic: MergeEdge[] = [
      { mergedEntityId: "a", survivorEntityId: "b", status: "EXECUTED" },
      { mergedEntityId: "b", survivorEntityId: "a", status: "EXECUTED" },
    ];
    expect(resolveSurvivorChain(cyclic, "a")).toEqual(["b"]);
  });
});

describe("collectMergedInIdentities", () => {
  it("collects everything downstream, transitively", () => {
    expect(collectMergedInIdentities(merges, "whispered").sort()).toEqual(
      ["jenkins", "oldman", "vecna"].sort(),
    );
  });

  it("excludes PREPARED merges under executedOnly", () => {
    expect(collectMergedInIdentities(merges, "vecna", { executedOnly: true })).toEqual([
      "jenkins",
    ]);
  });

  it("is empty for a leaf identity", () => {
    expect(collectMergedInIdentities(merges, "jenkins")).toEqual([]);
  });
});

describe("wouldCreateCycle", () => {
  it("flags a self-merge", () => {
    expect(wouldCreateCycle(merges, "vecna", "vecna")).toBe(true);
  });

  it("flags a back-edge that closes the chain (whispered→jenkins)", () => {
    expect(wouldCreateCycle(merges, "whispered", "jenkins")).toBe(true);
  });

  it("allows an unrelated new merge", () => {
    expect(wouldCreateCycle(merges, "newnpc", "whispered")).toBe(false);
  });
});
