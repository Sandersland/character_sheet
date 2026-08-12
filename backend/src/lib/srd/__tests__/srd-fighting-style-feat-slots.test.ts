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
// level 1, Paladin and Ranger at level 2. Champion's extra style is #1148: L7
// in 2024 (SRD 5.2 p.82), L10 in 2014 (PHB'14 p.72) — the grant level forks by
// edition even though the feature exists in both.
// #1529: fightingStyleFeatSlots now takes the class's resolved
// fightingStyleFeatLevel (CharacterClass column) directly, not a className.
describe("fightingStyleFeatSlots", () => {
  it("Fighter's grant level (1): a slot from level 1 on", () => {
    expect(fightingStyleFeatSlots(1, 1, undefined, "EDITION_2024")).toBe(1);
    expect(fightingStyleFeatSlots(1, 20, undefined, "EDITION_2024")).toBe(1);
  });
  it("Paladin/Ranger's grant level (2): a slot from level 2, not level 1", () => {
    expect(fightingStyleFeatSlots(2, 1, undefined, "EDITION_2024")).toBe(0);
    expect(fightingStyleFeatSlots(2, 2, undefined, "EDITION_2024")).toBe(1);
    expect(fightingStyleFeatSlots(2, 5, undefined, "EDITION_2024")).toBe(1);
  });
  it("null grant level (a class that never grants one) and level 0 get 0", () => {
    expect(fightingStyleFeatSlots(null, 20, undefined, "EDITION_2024")).toBe(0);
    expect(fightingStyleFeatSlots(undefined, 6, undefined, "EDITION_2024")).toBe(0);
    expect(fightingStyleFeatSlots(1, 0, undefined, "EDITION_2024")).toBe(0);
  });

  // #1148: Champion's Additional Fighting Style — a SECOND slot on top of
  // Fighter's base grant, at a threshold that forks by edition.
  describe("fighter-champion", () => {
    it("2024: 1 slot below L7, 2 slots from L7 on", () => {
      expect(fightingStyleFeatSlots(1, 6, "fighter-champion", "EDITION_2024")).toBe(1);
      expect(fightingStyleFeatSlots(1, 7, "fighter-champion", "EDITION_2024")).toBe(2);
      expect(fightingStyleFeatSlots(1, 20, "fighter-champion", "EDITION_2024")).toBe(2);
    });
    it("2014: 1 slot below L10, 2 slots from L10 on", () => {
      expect(fightingStyleFeatSlots(1, 9, "fighter-champion", "EDITION_2014")).toBe(1);
      expect(fightingStyleFeatSlots(1, 10, "fighter-champion", "EDITION_2014")).toBe(2);
      expect(fightingStyleFeatSlots(1, 20, "fighter-champion", "EDITION_2014")).toBe(2);
    });
    // Mutation proof (#1148 AC): sharing ONE threshold between the two
    // editions makes one of these two go red — a 2024 Champion at L9 (past
    // 2014's L10... no, below it) must NOT get credit for 2014's L10 gate,
    // and a 2014 Champion at L7 must NOT get credit for 2024's L7 gate.
    it("a 2024 Champion below 2014's L10 threshold already has 2 (its own L7 gate applies)", () => {
      expect(fightingStyleFeatSlots(1, 9, "fighter-champion", "EDITION_2024")).toBe(2);
    });
    it("a 2014 Champion at 2024's L7 threshold still has only 1 (2014's own L10 gate applies)", () => {
      expect(fightingStyleFeatSlots(1, 7, "fighter-champion", "EDITION_2014")).toBe(1);
    });
    it("a non-Champion Fighter at the same levels never gets the second slot, in either edition", () => {
      expect(fightingStyleFeatSlots(1, 7, undefined, "EDITION_2024")).toBe(1);
      expect(fightingStyleFeatSlots(1, 10, undefined, "EDITION_2014")).toBe(1);
      expect(fightingStyleFeatSlots(1, 20, undefined, "EDITION_2024")).toBe(1);
      expect(fightingStyleFeatSlots(1, 20, undefined, "EDITION_2014")).toBe(1);
    });
    it("an off-slug fighter subclass (e.g. Battle Master) never gets the second slot", () => {
      expect(fightingStyleFeatSlots(1, 20, "fighter-battle-master", "EDITION_2024")).toBe(1);
    });
  });
});

// #1529: characterFightingStyleFeatSlots reads each entry's `class` relation
// (fightingStyleFeatLevel) instead of looking up by `name` — a homebrew entry
// (`class` absent/null) resolves via the `?? null` fallback to "never granted".
// `class.name`/`subclass`/`subclassRef` (#1148) feed the per-entry
// resolveSubclassSlug resolution shared with fightingStyleGrantingClassNames
// below (fightingStyleFeatSlotsForEntry) — a #1495 review finding folded in
// here: the two functions used to copy-paste this predicate.
describe("characterFightingStyleFeatSlots", () => {
  const FIGHTER = { name: "Fighter", fightingStyleFeatLevel: 1 };
  const PALADIN = { name: "Paladin", fightingStyleFeatLevel: 2 };
  const RANGER = { name: "Ranger", fightingStyleFeatLevel: 2 };
  const WIZARD = { name: "Wizard", fightingStyleFeatLevel: null };
  const champion = (level: number) => ({ level, subclass: "Champion", subclassRef: null, class: FIGHTER });

  it("sums entitlement across class entries at each entry's effective level", () => {
    expect(characterFightingStyleFeatSlots([{ level: 5, class: FIGHTER }], 5, "EDITION_2024")).toBe(1);
    // Fighter1/Wizard4 multiclass — the Fighter entry still entitles a slot (#1065).
    expect(
      characterFightingStyleFeatSlots(
        [{ level: 4, class: WIZARD }, { level: 1, class: FIGHTER }],
        5,
        "EDITION_2024",
      ),
    ).toBe(1);
    // Paladin 6 / Ranger 5 — both entries entitle a slot.
    expect(
      characterFightingStyleFeatSlots(
        [{ level: 6, class: PALADIN }, { level: 5, class: RANGER }],
        11,
        "EDITION_2024",
      ),
    ).toBe(2);
  });
  it("a Paladin at level 1 (no second level yet) gets 0", () => {
    expect(characterFightingStyleFeatSlots([{ level: 1, class: PALADIN }], 1, "EDITION_2024")).toBe(0);
  });
  it("a homebrew entry with no class relation gets 0, regardless of level", () => {
    expect(characterFightingStyleFeatSlots([{ level: 5, class: null }], 5, "EDITION_2024")).toBe(0);
  });
  it("level-0 / empty roster gets 0", () => {
    expect(characterFightingStyleFeatSlots([], 0, "EDITION_2024")).toBe(0);
  });

  // #1148 AC: a 2024 Champion has 1 slot at L6, 2 at L7; a 2014 Champion has
  // 1 at L9, 2 at L10 — resolved via resolveSubclassSlug off subclass/
  // subclassRef/class.name, never a raw string comparison.
  it("2024 Champion: 1 slot at L6, 2 at L7", () => {
    expect(characterFightingStyleFeatSlots([champion(6)], 6, "EDITION_2024")).toBe(1);
    expect(characterFightingStyleFeatSlots([champion(7)], 7, "EDITION_2024")).toBe(2);
  });
  it("2014 Champion: 1 slot at L9, 2 at L10", () => {
    expect(characterFightingStyleFeatSlots([champion(9)], 9, "EDITION_2014")).toBe(1);
    expect(characterFightingStyleFeatSlots([champion(10)], 10, "EDITION_2014")).toBe(2);
  });
  it("resolves the FK slug (subclassRef) the same as the exact-name fallback", () => {
    const viaFk = { level: 7, subclass: "some drifted display name", subclassRef: { slug: "fighter-champion" }, class: FIGHTER };
    expect(characterFightingStyleFeatSlots([viaFk], 7, "EDITION_2024")).toBe(2);
  });
});

// #1495: fightingStyleGrantingClassNames feeds the offered-Fighting-Style
// union (fightingStyleFeatOfferedForClasses) — the class NAMES that have
// actually earned the feature at derivedLevel, not merely belong to a
// granting class. Uses the CANONICAL class.name (never the entry's own
// drifting display name, CharacterClassEntry.name) and the same per-entry
// evaluation characterFightingStyleFeatSlots already makes
// (fightingStyleFeatSlotsForEntry, #1148's dedup of the #1495 predicate).
describe("fightingStyleGrantingClassNames", () => {
  const FIGHTER = { name: "Fighter", fightingStyleFeatLevel: 1 };
  const PALADIN = { name: "Paladin", fightingStyleFeatLevel: 2 };
  const RANGER = { name: "Ranger", fightingStyleFeatLevel: 2 };
  const WIZARD = { name: "Wizard", fightingStyleFeatLevel: null };

  it("a single granting class at its grant level is included", () => {
    expect(fightingStyleGrantingClassNames([{ level: 1, class: FIGHTER }], 1, "EDITION_2024")).toEqual(["Fighter"]);
  });

  it("excludes a class that hasn't reached its OWN grant level yet — Fighter1/Ranger1 (Ranger's FS is at L2)", () => {
    expect(
      fightingStyleGrantingClassNames(
        [{ level: 1, class: FIGHTER }, { level: 1, class: RANGER }],
        2,
        "EDITION_2024",
      ),
    ).toEqual(["Fighter"]);
  });

  it("includes both once the second class reaches ITS grant level — Fighter1/Ranger2", () => {
    expect(
      fightingStyleGrantingClassNames(
        [{ level: 1, class: FIGHTER }, { level: 2, class: RANGER }],
        3,
        "EDITION_2024",
      ),
    ).toEqual(["Fighter", "Ranger"]);
  });

  it("a non-granting class (Wizard) is never included, regardless of level", () => {
    expect(fightingStyleGrantingClassNames([{ level: 20, class: WIZARD }], 20, "EDITION_2024")).toEqual([]);
  });

  it("a Paladin below its grant level (level 1) is excluded", () => {
    expect(fightingStyleGrantingClassNames([{ level: 1, class: PALADIN }], 1, "EDITION_2024")).toEqual([]);
  });

  it("a homebrew entry with no class relation is excluded", () => {
    expect(fightingStyleGrantingClassNames([{ level: 5, class: null }], 5, "EDITION_2024")).toEqual([]);
  });

  it("empty roster returns []", () => {
    expect(fightingStyleGrantingClassNames([], 0, "EDITION_2024")).toEqual([]);
  });

  // A Champion with 2 slots still reports "Fighter" once — this function
  // returns granting CLASS NAMES, not a slot count (characterFightingStyleFeatSlots
  // is the count; this stays a set of names regardless of how many slots
  // the class earned).
  it("a 2024 Champion at L7 (2 slots) still reports Fighter once, not twice", () => {
    const champion7 = { level: 7, subclass: "Champion", subclassRef: null, class: FIGHTER };
    expect(fightingStyleGrantingClassNames([champion7], 7, "EDITION_2024")).toEqual(["Fighter"]);
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
