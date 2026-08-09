import { describe, expect, it } from "vitest";

import { QUIVERING_PALM_LEVEL, hasQuiveringPalm, resolveQuiveringPalmDamage } from "@/lib/classes/quivering-palm.js";

// #1337: hasQuiveringPalm is the single source of the L17 gate — both
// character-serialize.ts's quiveringPalmRider and this module's own cast
// guard import it. No numeric literal for the gate appears here; the
// boundary is derived from QUIVERING_PALM_LEVEL itself, so mutating that one
// constant would flip both this assertion and the rider/guard together.
describe("hasQuiveringPalm (#1337 shared gate)", () => {
  it("is false one level below the gate", () => {
    expect(hasQuiveringPalm(QUIVERING_PALM_LEVEL - 1)).toBe(false);
  });

  it("is true exactly at the gate", () => {
    expect(hasQuiveringPalm(QUIVERING_PALM_LEVEL)).toBe(true);
  });
});

describe("resolveQuiveringPalmDamage — 2024 (SRD 5.2: 10d12 Force, half on a successful Con save)", () => {
  it("is a fail (full damage) when the roll is below the DC", () => {
    expect(resolveQuiveringPalmDamage(10, 14, 60, "EDITION_2024")).toEqual({ outcome: "fail", appliedDamage: 60 });
  });

  it("is a success (half damage, rounded down) when the roll meets the DC", () => {
    expect(resolveQuiveringPalmDamage(14, 14, 61, "EDITION_2024")).toEqual({ outcome: "success", appliedDamage: 30 });
  });

  it("is a success when the roll exceeds the DC", () => {
    expect(resolveQuiveringPalmDamage(20, 14, 60, "EDITION_2024")).toEqual({ outcome: "success", appliedDamage: 30 });
  });

  it("rounds half damage down (SRD 5.2 'half as much')", () => {
    expect(resolveQuiveringPalmDamage(20, 14, 55, "EDITION_2024")).toEqual({ outcome: "success", appliedDamage: 27 });
  });
});

// #1501: SRD 5.1's outcome mapping is INVERTED from 2024's, not merely
// reworded — transcribed as the source states it (see resolveQuiveringPalmDamage's
// own JSDoc for the citation), never normalized to 2024's fail-full/
// success-half shape.
describe("resolveQuiveringPalmDamage — 2014 (SRD 5.1: fail drops to 0 HP, success takes full 10d10 necrotic)", () => {
  it("is a fail (drops to 0 — appliedDamage reads 0, rawDamage ignored) when the roll is below the DC", () => {
    expect(resolveQuiveringPalmDamage(10, 14, 60, "EDITION_2014")).toEqual({ outcome: "fail", appliedDamage: 0 });
  });

  it("is a success (FULL rolled damage, never halved) when the roll meets the DC", () => {
    expect(resolveQuiveringPalmDamage(14, 14, 61, "EDITION_2014")).toEqual({ outcome: "success", appliedDamage: 61 });
  });

  it("is a success when the roll exceeds the DC", () => {
    expect(resolveQuiveringPalmDamage(20, 14, 60, "EDITION_2014")).toEqual({ outcome: "success", appliedDamage: 60 });
  });
});
