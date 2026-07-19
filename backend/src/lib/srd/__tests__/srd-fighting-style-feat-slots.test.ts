import { describe, it, expect } from "vitest";

import {
  fightingStyleFeatSlots,
  characterFightingStyleFeatSlots,
  deriveRangedAttackRollBonus,
} from "@/lib/srd/srd.js";
import type { AdvancementEntry, FeatImprovement } from "@/lib/classes/resources.js";

// SRD 5.2: the Fighting Style feature grants a Fighting Style feat — Fighter at
// level 1, Paladin and Ranger at level 2. Champion's extra style at L7 is #1148.
describe("fightingStyleFeatSlots", () => {
  it("Fighter gains a Fighting Style feat slot at level 1", () => {
    expect(fightingStyleFeatSlots("fighter", 1)).toBe(1);
    expect(fightingStyleFeatSlots("Fighter", 20)).toBe(1);
  });
  it("Paladin and Ranger gain a slot at level 2, not level 1", () => {
    expect(fightingStyleFeatSlots("paladin", 1)).toBe(0);
    expect(fightingStyleFeatSlots("paladin", 2)).toBe(1);
    expect(fightingStyleFeatSlots("ranger", 1)).toBe(0);
    expect(fightingStyleFeatSlots("Ranger", 5)).toBe(1);
  });
  it("other classes and level 0 get 0", () => {
    expect(fightingStyleFeatSlots("wizard", 20)).toBe(0);
    expect(fightingStyleFeatSlots("rogue", 6)).toBe(0);
    expect(fightingStyleFeatSlots("fighter", 0)).toBe(0);
  });
});

describe("characterFightingStyleFeatSlots", () => {
  it("sums entitlement across class entries at each entry's effective level", () => {
    expect(characterFightingStyleFeatSlots([{ name: "Fighter", level: 5 }], 5)).toBe(1);
    // Fighter1/Wizard4 multiclass — the Fighter entry still entitles a slot (#1065).
    expect(
      characterFightingStyleFeatSlots([{ name: "Wizard", level: 4 }, { name: "Fighter", level: 1 }], 5),
    ).toBe(1);
    // Paladin 6 / Ranger 5 — both entries entitle a slot.
    expect(
      characterFightingStyleFeatSlots([{ name: "Paladin", level: 6 }, { name: "Ranger", level: 5 }], 11),
    ).toBe(2);
  });
  it("a Paladin at level 1 (no second level yet) gets 0", () => {
    expect(characterFightingStyleFeatSlots([{ name: "Paladin", level: 1 }], 1)).toBe(0);
  });
  it("level-0 / empty roster gets 0", () => {
    expect(characterFightingStyleFeatSlots([], 0)).toBe(0);
  });
});

describe("deriveRangedAttackRollBonus", () => {
  const entry = (improvements: FeatImprovement[] | undefined): AdvancementEntry => ({
    id: "x",
    level: 1,
    kind: "feat",
    abilityDeltas: {},
    hpDelta: 0,
    initDelta: 0,
    improvements,
  });
  it("sums rangedAttackRoll improvement amounts (Archery +2)", () => {
    expect(deriveRangedAttackRollBonus([entry([{ target: "rangedAttackRoll", amount: 2 }])])).toBe(2);
  });
  it("ignores non-ranged improvement targets", () => {
    expect(deriveRangedAttackRollBonus([entry([{ target: "armorClassWhileArmored", amount: 1 }])])).toBe(0);
  });
  it("returns 0 for no advancements / no improvements", () => {
    expect(deriveRangedAttackRollBonus([])).toBe(0);
    expect(deriveRangedAttackRollBonus([entry(undefined)])).toBe(0);
  });
});
