import { describe, expect, it } from "vitest";

import {
  collectMergedInIdentities,
  mergeForMerged,
  resolveSurvivorChain,
  ultimateSurvivorName,
} from "@/lib/merges";
import type { CampaignEntity, CampaignEntityMerge } from "@/types/character";

function merge(
  mergedEntityId: string,
  survivorEntityId: string,
  status: "PREPARED" | "EXECUTED" = "EXECUTED",
): CampaignEntityMerge {
  return {
    id: `${mergedEntityId}-${survivorEntityId}`,
    campaignId: "c",
    mergedEntityId,
    survivorEntityId,
    status,
    note: null,
    preparedAt: "2026-01-01T00:00:00.000Z",
    executedAt: status === "EXECUTED" ? "2026-01-02T00:00:00.000Z" : null,
  };
}

function entity(id: string, name: string): CampaignEntity {
  return {
    id,
    campaignId: "c",
    type: "NPC",
    name,
    aliases: [],
    notes: null,
    visibility: "REVEALED",
    createdAt: "",
    updatedAt: "",
  };
}

const merges = [merge("jenkins", "vecna"), merge("vecna", "whispered")];

describe("resolveSurvivorChain", () => {
  it("returns the transitive survivor chain nearest-first", () => {
    expect(resolveSurvivorChain(merges, "jenkins")).toEqual(["vecna", "whispered"]);
  });

  it("is empty for a top identity", () => {
    expect(resolveSurvivorChain(merges, "whispered")).toEqual([]);
  });

  it("skips a PREPARED edge under executedOnly", () => {
    const withPrep = [merge("a", "b", "PREPARED")];
    expect(resolveSurvivorChain(withPrep, "a", { executedOnly: true })).toEqual([]);
    expect(resolveSurvivorChain(withPrep, "a")).toEqual(["b"]);
  });
});

describe("collectMergedInIdentities", () => {
  it("collects everything downstream", () => {
    expect(collectMergedInIdentities(merges, "whispered").sort()).toEqual(["jenkins", "vecna"]);
  });

  it("is empty for a leaf", () => {
    expect(collectMergedInIdentities(merges, "jenkins")).toEqual([]);
  });
});

describe("mergeForMerged", () => {
  it("finds the merge where the id is the old identity", () => {
    expect(mergeForMerged(merges, "jenkins")?.survivorEntityId).toBe("vecna");
    expect(mergeForMerged(merges, "whispered")).toBeUndefined();
  });
});

describe("ultimateSurvivorName", () => {
  const byId = new Map([
    ["jenkins", entity("jenkins", "Jenkins")],
    ["vecna", entity("vecna", "Vecna")],
    ["whispered", entity("whispered", "Whispered One")],
  ]);

  it("resolves the top-of-chain survivor name", () => {
    expect(ultimateSurvivorName(merges, byId, "jenkins")).toBe("Whispered One");
  });

  it("is empty for a non-merged identity", () => {
    expect(ultimateSurvivorName(merges, byId, "whispered")).toBe("");
  });
});
