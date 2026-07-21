import { describe, it, expect } from "vitest";

import {
  fightingStyleFeatSlots,
  characterFightingStyleFeatSlots,
  advancementSlotsForLevel,
  characterAdvancementSlots,
  deriveRangedAttackRollBonus,
  deriveWeaponAttackBonus,
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

// PHB'24 p.163: ASI/feat slots accrue per class level (#1073), not
// primary-class × total level.
describe("characterAdvancementSlots", () => {
  it("Wizard 3 / Fighter 8 gets 3 slots (Fighter's 4/6/8), not the Wizard schedule at total level 11", () => {
    expect(
      characterAdvancementSlots([{ name: "Wizard", level: 3 }, { name: "Fighter", level: 8 }], 11),
    ).toBe(3);
  });
  it("single-class collapses to advancementSlotsForLevel (byte-identical)", () => {
    expect(characterAdvancementSlots([{ name: "Fighter", level: 8 }], 8)).toBe(
      advancementSlotsForLevel("Fighter", 8),
    );
    expect(characterAdvancementSlots([{ name: "Wizard", level: 12 }], 12)).toBe(
      advancementSlotsForLevel("Wizard", 12),
    );
  });
  it("level-0 / empty roster gets 0", () => {
    expect(characterAdvancementSlots([], 0)).toBe(0);
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

// #1137: Archery's +2 now arrives as a rangedAttackRollBonus number (from feat
// improvements), applied to ranged weapons only — replacing the former
// fightingStyle-key param.
describe("deriveWeaponAttackBonus rangedAttackRollBonus", () => {
  const scores = { strength: 10, dexterity: 16 }; // +3 DEX, +0 STR
  const noGrants: ReadonlyArray<{ name: string }> = [];
  const ranged = { name: "Longbow", finesse: false, weaponRange: "ranged" };
  const melee = { name: "Longsword", finesse: false, weaponRange: "melee" };

  it("adds the ranged bonus to a ranged weapon only", () => {
    expect(deriveWeaponAttackBonus(ranged, scores, 2, noGrants, 2)).toBe(
      deriveWeaponAttackBonus(ranged, scores, 2, noGrants, 0) + 2,
    );
    expect(deriveWeaponAttackBonus(melee, scores, 2, noGrants, 2)).toBe(
      deriveWeaponAttackBonus(melee, scores, 2, noGrants, 0),
    );
  });

  it("still applies the attackRoll buff on top of the ranged bonus", () => {
    const base = deriveWeaponAttackBonus(ranged, scores, 2, noGrants, 0, 0);
    expect(deriveWeaponAttackBonus(ranged, scores, 2, noGrants, 2, 4)).toBe(base + 6);
  });
});
