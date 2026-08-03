import { describe, it, expect } from "vitest";

import {
  PREPARED_SPELLS_BY_CLASS,
  preparedSpellCountAt,
  cantripsKnownAtLevel,
  swapCadenceFor,
  deriveSpellcasting,
  spellcastingStartLevel,
  casterModelFor,
  casterModelForEntries,
} from "@/lib/srd/srd.js";

// SRD 5.2 prepared-spell counts (2024). Spot checks at L1/5/12/17/20 per class,
// plus the third-caster (EK/AT) column keyed by subclass from class level 3.
describe("preparedSpellCountAt — per-class SRD 5.2 tables", () => {
  it("full casters that share the Bard/Cleric/Druid column", () => {
    for (const cls of ["bard", "cleric", "druid"]) {
      expect(preparedSpellCountAt(cls, 1, null, {}, "EDITION_2024")).toBe(4);
      expect(preparedSpellCountAt(cls, 5, null, {}, "EDITION_2024")).toBe(9);
      expect(preparedSpellCountAt(cls, 12, null, {}, "EDITION_2024")).toBe(16);
      expect(preparedSpellCountAt(cls, 17, null, {}, "EDITION_2024")).toBe(19);
      expect(preparedSpellCountAt(cls, 20, null, {}, "EDITION_2024")).toBe(22);
    }
  });

  it("Sorcerer (starts lower at L1/L2, else the full-caster column)", () => {
    expect(preparedSpellCountAt("sorcerer", 1, null, {}, "EDITION_2024")).toBe(2);
    expect(preparedSpellCountAt("sorcerer", 5, null, {}, "EDITION_2024")).toBe(9);
    expect(preparedSpellCountAt("sorcerer", 12, null, {}, "EDITION_2024")).toBe(16);
    expect(preparedSpellCountAt("sorcerer", 17, null, {}, "EDITION_2024")).toBe(19);
    expect(preparedSpellCountAt("sorcerer", 20, null, {}, "EDITION_2024")).toBe(22);
  });

  it("Wizard (highest ceiling)", () => {
    expect(preparedSpellCountAt("wizard", 1, null, {}, "EDITION_2024")).toBe(4);
    expect(preparedSpellCountAt("wizard", 5, null, {}, "EDITION_2024")).toBe(9);
    expect(preparedSpellCountAt("wizard", 12, null, {}, "EDITION_2024")).toBe(16);
    expect(preparedSpellCountAt("wizard", 17, null, {}, "EDITION_2024")).toBe(22);
    expect(preparedSpellCountAt("wizard", 20, null, {}, "EDITION_2024")).toBe(25);
  });

  it("Warlock", () => {
    expect(preparedSpellCountAt("warlock", 1, null, {}, "EDITION_2024")).toBe(2);
    expect(preparedSpellCountAt("warlock", 5, null, {}, "EDITION_2024")).toBe(6);
    expect(preparedSpellCountAt("warlock", 12, null, {}, "EDITION_2024")).toBe(11);
    expect(preparedSpellCountAt("warlock", 17, null, {}, "EDITION_2024")).toBe(14);
    expect(preparedSpellCountAt("warlock", 20, null, {}, "EDITION_2024")).toBe(15);
  });

  it("Paladin and Ranger share the half-caster column (from level 1)", () => {
    for (const cls of ["paladin", "ranger"]) {
      expect(preparedSpellCountAt(cls, 1, null, {}, "EDITION_2024")).toBe(2);
      expect(preparedSpellCountAt(cls, 5, null, {}, "EDITION_2024")).toBe(6);
      expect(preparedSpellCountAt(cls, 12, null, {}, "EDITION_2024")).toBe(10);
      expect(preparedSpellCountAt(cls, 17, null, {}, "EDITION_2024")).toBe(14);
      expect(preparedSpellCountAt(cls, 20, null, {}, "EDITION_2024")).toBe(15);
    }
  });

  it("Eldritch Knight / Arcane Trickster (third caster, keyed by subclass from L3)", () => {
    for (const sub of ["Eldritch Knight", "Arcane Trickster"]) {
      expect(preparedSpellCountAt("fighter", 2, sub, {}, "EDITION_2024")).toBeNull(); // subclass not active yet
      expect(preparedSpellCountAt("fighter", 3, sub, {}, "EDITION_2024")).toBe(3);
      expect(preparedSpellCountAt("fighter", 5, sub, {}, "EDITION_2024")).toBe(4);
      expect(preparedSpellCountAt("fighter", 12, sub, {}, "EDITION_2024")).toBe(8);
      expect(preparedSpellCountAt("fighter", 17, sub, {}, "EDITION_2024")).toBe(11);
      expect(preparedSpellCountAt("fighter", 20, sub, {}, "EDITION_2024")).toBe(13);
    }
  });

  it("returns null for a non-caster", () => {
    expect(preparedSpellCountAt("fighter", 5, null, {}, "EDITION_2024")).toBeNull();
    expect(preparedSpellCountAt("barbarian", 20, null, {}, "EDITION_2024")).toBeNull();
  });

  it("every prepared-caster column is monotonically non-decreasing over levels 1-20", () => {
    for (const table of Object.values(PREPARED_SPELLS_BY_CLASS)) {
      for (let i = 1; i < 20; i++) expect(table[i]).toBeGreaterThanOrEqual(table[i - 1]);
    }
  });

  it("third-caster column is monotonically non-decreasing over levels 3-20", () => {
    for (let level = 4; level <= 20; level++) {
      expect(preparedSpellCountAt("fighter", level, "Eldritch Knight", {}, "EDITION_2024")).toBeGreaterThanOrEqual(
        preparedSpellCountAt("fighter", level - 1, "Eldritch Knight", {}, "EDITION_2024") ?? 0,
      );
    }
  });
});

// #1507: SRD 5.1 "known" caster tables (Bard/Sorcerer/Ranger) and the
// Cleric/Druid/Wizard/Paladin ability-mod formula, plus the Warlock/EK/AT
// no-fork identity proofs.
describe("preparedSpellCountAt — SRD 5.1 (2014) tables and formulas", () => {
  it("Bard/Sorcerer/Ranger 5 (both editions per the AC table)", () => {
    expect(preparedSpellCountAt("bard", 5, null, {}, "EDITION_2014")).toBe(8);
    expect(preparedSpellCountAt("bard", 5, null, {}, "EDITION_2024")).toBe(9);
    expect(preparedSpellCountAt("sorcerer", 5, null, {}, "EDITION_2014")).toBe(6);
    expect(preparedSpellCountAt("sorcerer", 5, null, {}, "EDITION_2024")).toBe(9);
    expect(preparedSpellCountAt("ranger", 5, null, {}, "EDITION_2014")).toBe(4);
    expect(preparedSpellCountAt("ranger", 5, null, {}, "EDITION_2024")).toBe(6);
  });

  it("Ranger 2014 has no Spells Known at level 1 (dash row, not 0)", () => {
    expect(preparedSpellCountAt("ranger", 1, null, {}, "EDITION_2014")).toBeNull();
  });

  it("Warlock is identical between editions at every level 1-20 (no-fork proof)", () => {
    for (let level = 1; level <= 20; level++) {
      expect(preparedSpellCountAt("warlock", level, null, {}, "EDITION_2014")).toBe(
        preparedSpellCountAt("warlock", level, null, {}, "EDITION_2024"),
      );
    }
  });

  it("Eldritch Knight / Arcane Trickster are identical between editions from level 3 (no-fork proof)", () => {
    for (const sub of ["Eldritch Knight", "Arcane Trickster"]) {
      for (let level = 3; level <= 20; level++) {
        expect(preparedSpellCountAt("fighter", level, sub, {}, "EDITION_2014")).toBe(
          preparedSpellCountAt("fighter", level, sub, {}, "EDITION_2024"),
        );
      }
    }
  });

  it("Cleric/Druid/Wizard use ability modifier + level, minimum 1", () => {
    expect(preparedSpellCountAt("cleric", 3, null, { wisdom: 16 }, "EDITION_2014")).toBe(6); // +3 + 3
    expect(preparedSpellCountAt("cleric", 1, null, { wisdom: 8 }, "EDITION_2014")).toBe(1); // -1 + 1 = 0, floored to 1
    expect(preparedSpellCountAt("druid", 5, null, { wisdom: 14 }, "EDITION_2014")).toBe(7); // +2 + 5
    expect(preparedSpellCountAt("wizard", 5, null, { intelligence: 14 }, "EDITION_2014")).toBe(7); // +2 + 5
  });

  it("Paladin uses ability modifier + half class level (floored), minimum 1, and is null at level 1", () => {
    expect(preparedSpellCountAt("paladin", 1, null, { charisma: 20 }, "EDITION_2014")).toBeNull();
    expect(preparedSpellCountAt("paladin", 5, null, { charisma: 14 }, "EDITION_2014")).toBe(4); // +2 + 2
  });
});

describe("cantripsKnownAtLevel — SRD 5.2 cantrip columns (data only, #1131 wires the step)", () => {
  const cases: Array<[string, number, number, number]> = [
    // [class, atL1, atL4, atL10]
    ["bard", 2, 3, 4],
    ["cleric", 3, 4, 5],
    ["druid", 2, 3, 4],
    ["sorcerer", 4, 5, 6],
    ["wizard", 3, 4, 5],
    ["warlock", 2, 3, 4],
  ];
  it.each(cases)("%s cantrips: %i @1, %i @4, %i @10", (cls, a1, a4, a10) => {
    expect(cantripsKnownAtLevel(cls, 1)).toBe(a1);
    expect(cantripsKnownAtLevel(cls, 4)).toBe(a4);
    expect(cantripsKnownAtLevel(cls, 10)).toBe(a10);
  });

  it("Paladin/Ranger prepare no cantrips", () => {
    expect(cantripsKnownAtLevel("paladin", 20)).toBe(0);
    expect(cantripsKnownAtLevel("ranger", 20)).toBe(0);
  });

  it("Eldritch Knight / Arcane Trickster: 2 from L3, 3 from L10", () => {
    expect(cantripsKnownAtLevel("fighter", 2, "Eldritch Knight")).toBe(0);
    expect(cantripsKnownAtLevel("fighter", 3, "Eldritch Knight")).toBe(2);
    expect(cantripsKnownAtLevel("rogue", 10, "Arcane Trickster")).toBe(3);
  });
});

describe("swapCadenceFor — SRD 5.2 spell-swap cadence", () => {
  it("onLevelUp for Bard/Sorcerer/Warlock + EK/AT", () => {
    for (const cls of ["bard", "sorcerer", "warlock"]) expect(swapCadenceFor(cls, null, "EDITION_2024")).toBe("onLevelUp");
    expect(swapCadenceFor("fighter", "Eldritch Knight", "EDITION_2024")).toBe("onLevelUp");
    expect(swapCadenceFor("rogue", "Arcane Trickster", "EDITION_2024")).toBe("onLevelUp");
  });

  it("oneOnLongRest for Paladin/Ranger", () => {
    expect(swapCadenceFor("paladin", null, "EDITION_2024")).toBe("oneOnLongRest");
    expect(swapCadenceFor("ranger", null, "EDITION_2024")).toBe("oneOnLongRest");
  });

  it("anyOnLongRest for Cleric/Druid/Wizard", () => {
    for (const cls of ["cleric", "druid", "wizard"]) expect(swapCadenceFor(cls, null, "EDITION_2024")).toBe("anyOnLongRest");
  });

  it("null for a non-caster", () => {
    expect(swapCadenceFor("fighter", null, "EDITION_2024")).toBeNull();
  });

  it("2014 Ranger swaps onLevelUp (not oneOnLongRest) and Paladin swaps anyOnLongRest (#1507)", () => {
    expect(swapCadenceFor("ranger", null, "EDITION_2014")).toBe("onLevelUp");
    expect(swapCadenceFor("paladin", null, "EDITION_2014")).toBe("anyOnLongRest");
  });

  it("2014 Bard/Sorcerer/Warlock/EK/AT agree with 2024 (onLevelUp)", () => {
    for (const cls of ["bard", "sorcerer", "warlock"]) expect(swapCadenceFor(cls, null, "EDITION_2014")).toBe("onLevelUp");
    expect(swapCadenceFor("fighter", "Eldritch Knight", "EDITION_2014")).toBe("onLevelUp");
  });
});

describe("2024 half-casters cast from level 1", () => {
  it("Paladin level 1 has two 1st-level slots", () => {
    const derived = deriveSpellcasting("paladin", 1, { charisma: 16 }, 2, undefined, "EDITION_2024");
    expect(derived?.slotTotals).toEqual([{ level: 1, total: 2 }]);
  });

  it("Ranger level 1 has two 1st-level slots", () => {
    const derived = deriveSpellcasting("ranger", 1, { wisdom: 16 }, 2, undefined, "EDITION_2024");
    expect(derived?.slotTotals).toEqual([{ level: 1, total: 2 }]);
  });
});

describe("2014 half-casters cast from level 2, not level 1 (#1507 D4)", () => {
  it("Paladin/Ranger level 1 has no spellcasting at all", () => {
    expect(deriveSpellcasting("paladin", 1, { charisma: 16 }, 2, undefined, "EDITION_2014")).toBeNull();
    expect(deriveSpellcasting("ranger", 1, { wisdom: 16 }, 2, undefined, "EDITION_2014")).toBeNull();
  });

  it("Paladin/Ranger levels 2-20 have identical slotTotals between editions", () => {
    for (const cls of ["paladin", "ranger"] as const) {
      const scores = { charisma: 16, wisdom: 16 };
      for (let level = 2; level <= 20; level++) {
        expect(deriveSpellcasting(cls, level, scores, 4, undefined, "EDITION_2014")?.slotTotals).toEqual(
          deriveSpellcasting(cls, level, scores, 4, undefined, "EDITION_2024")?.slotTotals,
        );
      }
    }
  });
});

describe("spellcastingStartLevel", () => {
  it("is 3 for a third-caster subclass in both editions", () => {
    expect(spellcastingStartLevel("fighter", "Eldritch Knight", "EDITION_2014")).toBe(3);
    expect(spellcastingStartLevel("rogue", "Arcane Trickster", "EDITION_2024")).toBe(3);
  });

  it("is 2 for a 2014 Paladin/Ranger and 1 for a 2024 one", () => {
    expect(spellcastingStartLevel("paladin", null, "EDITION_2014")).toBe(2);
    expect(spellcastingStartLevel("ranger", null, "EDITION_2014")).toBe(2);
    expect(spellcastingStartLevel("paladin", null, "EDITION_2024")).toBe(1);
    expect(spellcastingStartLevel("ranger", null, "EDITION_2024")).toBe(1);
  });

  it("is 1 for every other class in both editions", () => {
    expect(spellcastingStartLevel("bard", null, "EDITION_2014")).toBe(1);
    expect(spellcastingStartLevel("wizard", null, "EDITION_2024")).toBe(1);
  });
});

describe("casterModelFor / casterModelForEntries (#1507 D5)", () => {
  it("2014: known for Bard/Sorcerer/Warlock/Ranger and EK/AT", () => {
    for (const cls of ["bard", "sorcerer", "warlock", "ranger"]) {
      expect(casterModelFor(cls, null, "EDITION_2014")).toBe("known");
    }
    expect(casterModelFor("fighter", "Eldritch Knight", "EDITION_2014")).toBe("known");
    expect(casterModelFor("rogue", "Arcane Trickster", "EDITION_2014")).toBe("known");
  });

  it("2014: prepared for Cleric/Druid/Wizard/Paladin", () => {
    for (const cls of ["cleric", "druid", "wizard", "paladin"]) {
      expect(casterModelFor(cls, null, "EDITION_2014")).toBe("prepared");
    }
  });

  it("2024: prepared for every caster", () => {
    for (const cls of ["bard", "sorcerer", "warlock", "ranger", "cleric", "druid", "wizard", "paladin"]) {
      expect(casterModelFor(cls, null, "EDITION_2024")).toBe("prepared");
    }
  });

  it("null for a non-caster in either edition", () => {
    expect(casterModelFor("fighter", null, "EDITION_2014")).toBeNull();
    expect(casterModelFor("barbarian", null, "EDITION_2024")).toBeNull();
  });

  it("a 2014 Bard 3 / Cleric 2 multiclass resolves to prepared (mixed model)", () => {
    expect(
      casterModelForEntries(
        [
          { name: "bard", subclass: null },
          { name: "cleric", subclass: null },
        ],
        "EDITION_2014",
      ),
    ).toBe("prepared");
  });

  it("an all-known 2014 multiclass resolves to known", () => {
    expect(
      casterModelForEntries(
        [
          { name: "bard", subclass: null },
          { name: "warlock", subclass: null },
        ],
        "EDITION_2014",
      ),
    ).toBe("known");
  });

  it("null when no entry is a caster", () => {
    expect(
      casterModelForEntries(
        [
          { name: "fighter", subclass: null },
          { name: "barbarian", subclass: null },
        ],
        "EDITION_2014",
      ),
    ).toBeNull();
  });
});
