import { describe, expect, it } from "vitest";

import { abilityIncreasesSchema } from "@/lib/srd/species-ability-increases.js";

// Shape tests for the AbilityIncreaseSpec[] vocabulary — no DB needed. Pins
// the three forms Species/SpeciesVariant.abilityIncreases must accept (#1679)
// and rejects malformed rows the same way subclassSeedSchema does for SUBCLASSES.
describe("abilityIncreasesSchema", () => {
  it("accepts a fixed increase (Dwarf's +2 CON)", () => {
    const result = abilityIncreasesSchema.safeParse([{ ability: "constitution", amount: 2 }]);
    expect(result.success).toBe(true);
  });

  it("accepts a choose-from-list increase (Half-Elf's +1 to two of your choice)", () => {
    const result = abilityIncreasesSchema.safeParse([
      { ability: "charisma", amount: 2 },
      {
        choose: {
          count: 2,
          amount: 1,
          from: ["strength", "dexterity", "constitution", "intelligence", "wisdom"],
        },
      },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts a floating spread (Astral Elf's +2/+1-or-+1/+1/+1 shape)", () => {
    const result = abilityIncreasesSchema.safeParse([{ floating: 3 }]);
    expect(result.success).toBe(true);
  });

  it("accepts an empty array (every EDITION_2024 row)", () => {
    const result = abilityIncreasesSchema.safeParse([]);
    expect(result.success).toBe(true);
  });

  it("rejects an unknown ability name", () => {
    const result = abilityIncreasesSchema.safeParse([{ ability: "luck", amount: 2 }]);
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive amount", () => {
    const result = abilityIncreasesSchema.safeParse([{ ability: "strength", amount: 0 }]);
    expect(result.success).toBe(false);
  });

  it("rejects a malformed entry matching none of the three forms", () => {
    const result = abilityIncreasesSchema.safeParse([{ bogus: true }]);
    expect(result.success).toBe(false);
  });

  it("rejects a choose entry with an unknown ability in `from`", () => {
    const result = abilityIncreasesSchema.safeParse([
      { choose: { count: 1, amount: 1, from: ["luck"] } },
    ]);
    expect(result.success).toBe(false);
  });
});
