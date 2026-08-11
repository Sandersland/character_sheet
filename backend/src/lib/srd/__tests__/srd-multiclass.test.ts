import { describe, it, expect } from "vitest";

import {
  deriveSpellcasting,
  deriveMulticlassSpellcasting,
  casterFractionFor,
  CASTER_FRACTION_BY_CLASS,
  MULTICLASS_SPELL_SLOTS,
  FULL_CASTER_SLOTS,
  type SubclassCasterRef,
} from "@/lib/srd/srd.js";
import { ELDRITCH_KNIGHT, ARCANE_TRICKSTER, NON_CASTER_SUBCLASS } from "./third-caster.fixture.js";

// Even scores keep the ability math simple: mod = +2 at 14, +3 at 16, +0 at 10.
const SCORES = { intelligence: 16, wisdom: 14, charisma: 16, strength: 10, dexterity: 10, constitution: 10 };

describe("caster fraction rules data", () => {
  it("classifies full / half / pact / none classes", () => {
    expect(casterFractionFor("Wizard")).toBe("full");
    expect(casterFractionFor("Bard")).toBe("full");
    expect(casterFractionFor("Paladin")).toBe("half");
    expect(casterFractionFor("Ranger")).toBe("half");
    expect(casterFractionFor("Warlock")).toBe("pact");
    expect(casterFractionFor("Fighter")).toBe("none");
    expect(casterFractionFor("Rogue")).toBe("none");
  });

  it("classifies third-caster subclasses off subclassRef, never a name match (#1531)", () => {
    expect(casterFractionFor("Fighter", ELDRITCH_KNIGHT)).toBe("third");
    expect(casterFractionFor("Rogue", ARCANE_TRICKSTER)).toBe("third");
    // A plain Champion fighter is still a non-caster.
    expect(casterFractionFor("Fighter", NON_CASTER_SUBCLASS)).toBe("none");
    // No subclassRef at all (homebrew, or no subclass chosen) is also "none".
    expect(casterFractionFor("Fighter", null)).toBe("none");
  });

  it("exposes the caster fraction map as rules data", () => {
    expect(CASTER_FRACTION_BY_CLASS.wizard).toBe("full");
    expect(CASTER_FRACTION_BY_CLASS.paladin).toBe("half");
    expect(CASTER_FRACTION_BY_CLASS.warlock).toBe("pact");
  });

  it("shares the full-caster table as the multiclass table (PHB RAW)", () => {
    expect(MULTICLASS_SPELL_SLOTS).toBe(FULL_CASTER_SLOTS);
  });
});

describe("deriveMulticlassSpellcasting — single class byte-for-byte with deriveSpellcasting", () => {
  const cases: Array<{ name: string; level: number; label?: string; subclassRef?: SubclassCasterRef }> = [
    { name: "Wizard", level: 1 },
    { name: "Wizard", level: 5 },
    { name: "Wizard", level: 20 },
    { name: "Cleric", level: 11 },
    { name: "Paladin", level: 2 },
    { name: "Paladin", level: 3 }, // odd level: class table (3× L1) differs from multiclass floor
    { name: "Paladin", level: 6 },
    { name: "Ranger", level: 9 },
    { name: "Fighter", level: 3, label: "Eldritch Knight", subclassRef: ELDRITCH_KNIGHT },
    { name: "Rogue", level: 13, label: "Arcane Trickster", subclassRef: ARCANE_TRICKSTER },
    { name: "Fighter", level: 5 }, // non-caster
  ];

  for (const c of cases) {
    it(`${c.name} ${c.level}${c.label ? ` (${c.label})` : ""}`, () => {
      const single = deriveSpellcasting(c.name, c.level, SCORES, 3, c.subclassRef, "EDITION_2024");
      const multi = deriveMulticlassSpellcasting(
        [{ name: c.name, level: c.level, subclassRef: c.subclassRef ?? null }],
        SCORES,
        3,
        "EDITION_2024",
      );
      // Slot totals must match the class's own table exactly (not the multiclass floor math).
      expect(multi.slotTotals).toEqual(single?.slotTotals ?? []);
    });
  }
});

describe("deriveMulticlassSpellcasting — multiclass combos (PHB p. 164)", () => {
  it("Wizard 5 / Cleric 3 -> combined caster level 8", () => {
    const info = deriveMulticlassSpellcasting(
      [
        { name: "Wizard", level: 5 },
        { name: "Cleric", level: 3 },
      ],
      SCORES,
      3,
      "EDITION_2024",
    );
    expect(info.combinedCasterLevel).toBe(8);
    expect(info.slotTotals).toEqual(
      Object.entries(FULL_CASTER_SLOTS[8]).map(([lvl, total]) => ({ level: Number(lvl), total })),
    );
    expect(info.pact).toBeNull();
    // Per-class save DC / attack bonus: Wizard(INT 16 -> +3), Cleric(WIS 14 -> +2), pb 3.
    const wiz = info.classes.find((c) => c.className === "Wizard")!;
    const cle = info.classes.find((c) => c.className === "Cleric")!;
    expect(wiz.spellSaveDC).toBe(8 + 3 + 3);
    expect(wiz.spellAttackBonus).toBe(3 + 3);
    expect(cle.spellSaveDC).toBe(8 + 3 + 2);
    expect(cle.spellAttackBonus).toBe(3 + 2);
  });

  it("Paladin 6 / Sorcerer 2 -> 3 + 2 = 5", () => {
    const info = deriveMulticlassSpellcasting(
      [
        { name: "Paladin", level: 6 },
        { name: "Sorcerer", level: 2 },
      ],
      SCORES,
      3,
      "EDITION_2024",
    );
    expect(info.combinedCasterLevel).toBe(5);
    expect(info.slotTotals).toEqual(
      Object.entries(FULL_CASTER_SLOTS[5]).map(([lvl, total]) => ({ level: Number(lvl), total })),
    );
    expect(info.pact).toBeNull();
  });

  it("Warlock 3 / Bard 2 -> pact slots + caster-level-2 slots kept separate", () => {
    const info = deriveMulticlassSpellcasting(
      [
        { name: "Warlock", level: 3 },
        { name: "Bard", level: 2 },
      ],
      SCORES,
      2,
      "EDITION_2024",
    );
    // Only Bard 2 counts toward combined slots (Warlock is pact).
    expect(info.combinedCasterLevel).toBe(2);
    expect(info.slotTotals).toEqual([{ level: 1, total: 3 }]);
    // Pact Magic tracked separately: Warlock 3 -> two level-2 pact slots.
    expect(info.pact).toEqual({
      slotLevel: 2,
      count: 2,
      spellSaveDC: 8 + 2 + 3, // CHA 16 -> +3, pb 2
      spellAttackBonus: 2 + 3,
    });
  });

  it("third caster contributes floor(level/3): EK 6 / Wizard 4 -> 2 + 4 = 6", () => {
    const info = deriveMulticlassSpellcasting(
      [
        { name: "Fighter", level: 6, subclassRef: ELDRITCH_KNIGHT },
        { name: "Wizard", level: 4 },
      ],
      SCORES,
      3,
      "EDITION_2024",
    );
    expect(info.combinedCasterLevel).toBe(6);
    expect(info.slotTotals).toEqual(
      Object.entries(FULL_CASTER_SLOTS[6]).map(([lvl, total]) => ({ level: Number(lvl), total })),
    );
  });

  it("omits non-caster classes and returns empty when nobody casts", () => {
    const info = deriveMulticlassSpellcasting(
      [
        { name: "Fighter", level: 5 },
        { name: "Barbarian", level: 3 },
      ],
      SCORES,
      3,
      "EDITION_2024",
    );
    expect(info.combinedCasterLevel).toBe(0);
    expect(info.slotTotals).toEqual([]);
    expect(info.classes).toEqual([]);
    expect(info.pact).toBeNull();
  });

  it("carries Warlock Mystic Arcanum separately at high level", () => {
    const info = deriveMulticlassSpellcasting(
      [
        { name: "Warlock", level: 11 },
        { name: "Bard", level: 2 },
      ],
      SCORES,
      4,
      "EDITION_2024",
    );
    expect(info.arcana).toEqual([{ level: 6, total: 1 }]);
    expect(info.pact?.slotLevel).toBe(5);
  });
});
