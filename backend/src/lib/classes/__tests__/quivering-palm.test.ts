import { describe, expect, it } from "vitest";

import { resolveQuiveringPalmDamage } from "@/lib/classes/quivering-palm.js";

describe("resolveQuiveringPalmDamage (SRD 5.2: 10d12 Force, half on a successful Con save)", () => {
  it("is a fail (full damage) when the roll is below the DC", () => {
    expect(resolveQuiveringPalmDamage(10, 14, 60)).toEqual({ outcome: "fail", appliedDamage: 60 });
  });

  it("is a success (half damage, rounded down) when the roll meets the DC", () => {
    expect(resolveQuiveringPalmDamage(14, 14, 61)).toEqual({ outcome: "success", appliedDamage: 30 });
  });

  it("is a success when the roll exceeds the DC", () => {
    expect(resolveQuiveringPalmDamage(20, 14, 60)).toEqual({ outcome: "success", appliedDamage: 30 });
  });

  it("rounds half damage down (SRD 5.2 'half as much')", () => {
    expect(resolveQuiveringPalmDamage(20, 14, 55)).toEqual({ outcome: "success", appliedDamage: 27 });
  });
});
