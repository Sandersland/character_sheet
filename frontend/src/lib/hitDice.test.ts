import { describe, it, expect } from "vitest";

// The 5e rule cases this file used to cover (fixed average, the max(1, …)
// floor, and which class's die advances) did not disappear with #1380 — they
// moved to the backend planner's own suite (level-up-plan.test.ts), which is
// now the only place that arithmetic lives.
import { dieFaces, hpGainForRoll, readHitPointsMeta } from "@/lib/hitDice";

describe("readHitPointsMeta", () => {
  const served = { die: "d10", faces: 10, conMod: 3, fixedAverage: 6, averageGain: 9, minRoll: 4, maxRoll: 13 };

  it("reads the served numbers off the hitPoints step", () => {
    expect(readHitPointsMeta({ kind: "hitPoints", meta: served })).toEqual(served);
  });

  it("falls back to inert defaults for an absent step or absent meta", () => {
    const inert = { die: "", faces: 0, conMod: 0, fixedAverage: 0, averageGain: 0, minRoll: 0, maxRoll: 0 };
    expect(readHitPointsMeta(undefined)).toEqual(inert);
    expect(readHitPointsMeta({ kind: "hitPoints" })).toEqual(inert);
  });

  it("rejects wrongly-typed values rather than propagating NaN into the preview", () => {
    expect(readHitPointsMeta({ kind: "hitPoints", meta: { die: 10, faces: "10", conMod: null } })).toMatchObject({
      die: "",
      faces: 0,
      conMod: 0,
    });
  });
});

describe("dieFaces", () => {
  it("parses a hit-die string to its face count", () => {
    expect(dieFaces("d10")).toBe(10);
    expect(dieFaces("d6")).toBe(6);
    expect(dieFaces("d12")).toBe(12);
  });

  it("is case-insensitive on the leading d", () => {
    expect(dieFaces("D8")).toBe(8);
  });
});

describe("hpGainForRoll", () => {
  const d10Con3 = { die: "d10", faces: 10, conMod: 3, fixedAverage: 6, averageGain: 9, minRoll: 4, maxRoll: 13 };

  it("adds the served Con modifier to the player's roll", () => {
    expect(hpGainForRoll(d10Con3, 7)).toBe(10);
    expect(hpGainForRoll(d10Con3, 10)).toBe(13);
  });

  it("never drops below the served minRoll — the max(1, …) level-up floor", () => {
    const d6Con5Down = { die: "d6", faces: 6, conMod: -5, fixedAverage: 4, averageGain: 1, minRoll: 1, maxRoll: 1 };
    expect(hpGainForRoll(d6Con5Down, 1)).toBe(1);
    expect(hpGainForRoll(d6Con5Down, 4)).toBe(1);
  });
});
