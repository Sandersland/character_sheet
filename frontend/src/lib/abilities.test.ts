import { describe, it, expect } from "vitest";

import { skillBonus } from "@/lib/abilities";

describe("skillBonus", () => {
  // Dex 16 → +3 ability modifier throughout.
  it("is the bare ability modifier when neither proficient nor expert", () => {
    expect(skillBonus(16, 2, false)).toBe(3);
  });

  it("adds the proficiency bonus once when proficient", () => {
    expect(skillBonus(16, 2, true)).toBe(5);
  });

  it("doubles the proficiency bonus for expertise", () => {
    expect(skillBonus(16, 2, true, true)).toBe(7);
  });

  it("folds a non-zero tempModifier (#438 buff) into the total", () => {
    // +3 ability + 2 proficiency + 4 buff = +9.
    expect(skillBonus(16, 2, true, false, 4)).toBe(9);
    // A negative temp modifier subtracts.
    expect(skillBonus(16, 2, false, false, -2)).toBe(1);
  });
});
