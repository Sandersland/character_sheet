import { describe, it, expect } from "vitest";

import {
  fightingStyleFeatSlots,
  characterFightingStyleFeatSlots,
  fightingStyleGrantingClassNames,
  advancementSlotsForLevel,
  characterAdvancementSlots,
  deriveRangedAttackRollBonus,
  deriveWeaponAttackBonus,
} from "@/lib/srd/srd.js";
import type { AdvancementEntry, FeatImprovement } from "@/lib/classes/resources.js";

// SRD 5.2: the Fighting Style feature grants a Fighting Style feat — Fighter at
// level 1, Paladin and Ranger at level 2. Champion's extra style at L7 is #1148.
// #1529: fightingStyleFeatSlots now takes the class's resolved
// fightingStyleFeatLevel (CharacterClass column) directly, not a className.
describe("fightingStyleFeatSlots", () => {
  it("Fighter's grant level (1): a slot from level 1 on", () => {
    expect(fightingStyleFeatSlots(1, 1)).toBe(1);
    expect(fightingStyleFeatSlots(1, 20)).toBe(1);
  });
  it("Paladin/Ranger's grant level (2): a slot from level 2, not level 1", () => {
    expect(fightingStyleFeatSlots(2, 1)).toBe(0);
    expect(fightingStyleFeatSlots(2, 2)).toBe(1);
    expect(fightingStyleFeatSlots(2, 5)).toBe(1);
  });
  it("null grant level (a class that never grants one) and level 0 get 0", () => {
    expect(fightingStyleFeatSlots(null, 20)).toBe(0);
    expect(fightingStyleFeatSlots(undefined, 6)).toBe(0);
    expect(fightingStyleFeatSlots(1, 0)).toBe(0);
  });
});

// #1529: characterFightingStyleFeatSlots reads each entry's `class` relation
// (fightingStyleFeatLevel) instead of looking up by `name` — a homebrew entry
// (`class` absent/null) resolves via the `?? null` fallback to "never granted".
describe("characterFightingStyleFeatSlots", () => {
  const FIGHTER = { fightingStyleFeatLevel: 1 };
  const PALADIN = { fightingStyleFeatLevel: 2 };
  const RANGER = { fightingStyleFeatLevel: 2 };
  const WIZARD = { fightingStyleFeatLevel: null };

  it("sums entitlement across class entries at each entry's effective level", () => {
    expect(characterFightingStyleFeatSlots([{ level: 5, class: FIGHTER }], 5)).toBe(1);
    // Fighter1/Wizard4 multiclass — the Fighter entry still entitles a slot (#1065).
    expect(
      characterFightingStyleFeatSlots([{ level: 4, class: WIZARD }, { level: 1, class: FIGHTER }], 5),
    ).toBe(1);
    // Paladin 6 / Ranger 5 — both entries entitle a slot.
    expect(
      characterFightingStyleFeatSlots([{ level: 6, class: PALADIN }, { level: 5, class: RANGER }], 11),
    ).toBe(2);
  });
  it("a Paladin at level 1 (no second level yet) gets 0", () => {
    expect(characterFightingStyleFeatSlots([{ level: 1, class: PALADIN }], 1)).toBe(0);
  });
  it("a homebrew entry with no class relation gets 0, regardless of level", () => {
    expect(characterFightingStyleFeatSlots([{ level: 5, class: null }], 5)).toBe(0);
  });
  it("level-0 / empty roster gets 0", () => {
    expect(characterFightingStyleFeatSlots([], 0)).toBe(0);
  });
});

// #1495: fightingStyleGrantingClassNames feeds the offered-Fighting-Style
// union (fightingStyleFeatOfferedForClasses) — the class NAMES that have
// actually earned the feature at derivedLevel, not merely belong to a
// granting class. Uses the CANONICAL class.name (never the entry's own
// drifting display name, CharacterClassEntry.name) and the same per-entry
// effective-level judgment characterFightingStyleFeatSlots already makes.
describe("fightingStyleGrantingClassNames", () => {
  const FIGHTER = { name: "Fighter", fightingStyleFeatLevel: 1 };
  const PALADIN = { name: "Paladin", fightingStyleFeatLevel: 2 };
  const RANGER = { name: "Ranger", fightingStyleFeatLevel: 2 };
  const WIZARD = { name: "Wizard", fightingStyleFeatLevel: null };

  it("a single granting class at its grant level is included", () => {
    expect(fightingStyleGrantingClassNames([{ level: 1, class: FIGHTER }], 1)).toEqual(["Fighter"]);
  });

  it("excludes a class that hasn't reached its OWN grant level yet — Fighter1/Ranger1 (Ranger's FS is at L2)", () => {
    expect(
      fightingStyleGrantingClassNames(
        [{ level: 1, class: FIGHTER }, { level: 1, class: RANGER }],
        2,
      ),
    ).toEqual(["Fighter"]);
  });

  it("includes both once the second class reaches ITS grant level — Fighter1/Ranger2", () => {
    expect(
      fightingStyleGrantingClassNames(
        [{ level: 1, class: FIGHTER }, { level: 2, class: RANGER }],
        3,
      ),
    ).toEqual(["Fighter", "Ranger"]);
  });

  it("a non-granting class (Wizard) is never included, regardless of level", () => {
    expect(fightingStyleGrantingClassNames([{ level: 20, class: WIZARD }], 20)).toEqual([]);
  });

  it("a Paladin below its grant level (level 1) is excluded", () => {
    expect(fightingStyleGrantingClassNames([{ level: 1, class: PALADIN }], 1)).toEqual([]);
  });

  it("a homebrew entry with no class relation is excluded", () => {
    expect(fightingStyleGrantingClassNames([{ level: 5, class: null }], 5)).toEqual([]);
  });

  it("empty roster returns []", () => {
    expect(fightingStyleGrantingClassNames([], 0)).toEqual([]);
  });
});

// PHB'24 p.163: ASI/feat slots accrue per class level (#1073), not
// primary-class × total level. #1529: characterAdvancementSlots reads each
// entry's `class` relation (extraAsiLevels) instead of looking up by `name`.
describe("characterAdvancementSlots", () => {
  const FIGHTER = { extraAsiLevels: [6, 14] };
  const WIZARD = { extraAsiLevels: [] };

  it("Wizard 3 / Fighter 8 gets 3 slots (Fighter's 4/6/8), not the Wizard schedule at total level 11", () => {
    expect(
      characterAdvancementSlots([{ level: 3, class: WIZARD }, { level: 8, class: FIGHTER }], 11),
    ).toBe(3);
  });
  it("single-class collapses to advancementSlotsForLevel (byte-identical)", () => {
    expect(characterAdvancementSlots([{ level: 8, class: FIGHTER }], 8)).toBe(
      advancementSlotsForLevel(FIGHTER.extraAsiLevels, 8),
    );
    expect(characterAdvancementSlots([{ level: 12, class: WIZARD }], 12)).toBe(
      advancementSlotsForLevel(WIZARD.extraAsiLevels, 12),
    );
  });
  it("a homebrew entry with no class relation falls back to the base 5-slot schedule", () => {
    expect(characterAdvancementSlots([{ level: 19, class: null }], 19)).toBe(
      advancementSlotsForLevel([], 19),
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
