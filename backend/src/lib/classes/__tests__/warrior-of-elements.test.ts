// Pure (no DB) unit tests for the Warrior of the Elements damage rule (#1247).
import { describe, expect, it } from "vitest";

import { resolveElementalBurstDamage } from "@/lib/classes/warrior-of-elements.js";

describe("resolveElementalBurstDamage", () => {
  it("takes full damage on a failed Dexterity save (roll below the DC)", () => {
    expect(resolveElementalBurstDamage(10, 17, 30)).toEqual({ outcome: "fail", appliedDamage: 30 });
  });

  it("halves the damage (rounded down) on a made save (roll >= DC)", () => {
    expect(resolveElementalBurstDamage(17, 17, 30)).toEqual({ outcome: "success", appliedDamage: 15 });
    // Odd totals round down (SRD 5.2 "half as much").
    expect(resolveElementalBurstDamage(20, 17, 15)).toEqual({ outcome: "success", appliedDamage: 7 });
  });
});
