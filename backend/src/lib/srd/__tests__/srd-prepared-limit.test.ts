import { describe, it, expect } from "vitest";

import { derivePreparedSpellLimit } from "@/lib/srd/srd.js";

const single = (name: string, level: number, scores: Record<string, number>, subclass?: string) =>
  derivePreparedSpellLimit([{ name, level, subclass }], scores);

describe("derivePreparedSpellLimit", () => {
  it("Wizard 8 / INT 18 → 12 (mod 4 + level 8)", () => {
    expect(single("wizard", 8, { intelligence: 18 })).toBe(12);
  });

  it("Wizard 5 / INT 16 → 8 (mod 3 + level 5)", () => {
    expect(single("wizard", 5, { intelligence: 16 })).toBe(8);
  });

  it("Cleric and Druid full-caster parity on WIS", () => {
    expect(single("cleric", 8, { wisdom: 18 })).toBe(12);
    expect(single("druid", 8, { wisdom: 18 })).toBe(12);
  });

  it("Paladin 6 / CHA 16 → 6 (mod 3 + floor(6/2)=3)", () => {
    expect(single("paladin", 6, { charisma: 16 })).toBe(6);
  });

  it("Paladin 1 contributes 0 — multiclass sum ignores it", () => {
    expect(single("paladin", 1, { charisma: 16 })).toBeNull();
    expect(
      derivePreparedSpellLimit(
        [
          { name: "wizard", level: 5, subclass: null },
          { name: "paladin", level: 1, subclass: null },
        ],
        { intelligence: 16, charisma: 16 },
      ),
    ).toBe(8); // wizard-only: 3 + 5
  });

  it("multiclass sums each prepared class's own limit", () => {
    expect(
      derivePreparedSpellLimit(
        [
          { name: "wizard", level: 8, subclass: null },
          { name: "cleric", level: 4, subclass: null },
        ],
        { intelligence: 18, wisdom: 14 },
      ),
    ).toBe(18); // wizard 12 + cleric (2 + 4) 6
  });

  it("known / pact / third casters → null", () => {
    expect(single("bard", 8, { charisma: 18 })).toBeNull();
    expect(single("sorcerer", 8, { charisma: 18 })).toBeNull();
    expect(single("ranger", 8, { wisdom: 18 })).toBeNull();
    expect(single("warlock", 8, { charisma: 18 })).toBeNull();
    expect(single("fighter", 8, { intelligence: 18 }, "Eldritch Knight")).toBeNull();
  });

  it("max(1) floor: Cleric 1 with negative WIS mod → 1", () => {
    expect(single("cleric", 1, { wisdom: 8 })).toBe(1);
  });
});
