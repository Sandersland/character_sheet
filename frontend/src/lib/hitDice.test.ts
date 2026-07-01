import { describe, it, expect } from "vitest";

import { averageHitPointGain, dieFaces, hitPointGainRange } from "@/lib/hitDice";

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

describe("averageHitPointGain", () => {
  it("applies the 5e fixed average plus Con mod", () => {
    expect(averageHitPointGain(10, 2)).toBe(8); // floor(10/2)+1+2
    expect(averageHitPointGain(6, 0)).toBe(4);
    expect(averageHitPointGain(8, -1)).toBe(4);
  });

  it("clamps at a minimum of 1 for large negative Con mods", () => {
    expect(averageHitPointGain(6, -10)).toBe(1);
  });
});

describe("hitPointGainRange", () => {
  it("returns the inclusive roll range with Con mod applied", () => {
    expect(hitPointGainRange(10, 2)).toEqual({ min: 3, max: 12 });
    expect(hitPointGainRange(6, 0)).toEqual({ min: 1, max: 6 });
  });

  it("clamps both ends at a minimum of 1", () => {
    expect(hitPointGainRange(6, -5)).toEqual({ min: 1, max: 1 });
  });
});
