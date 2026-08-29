import { describe, expect, it } from "vitest";

import { FIGHTER_FEATURES } from "../fighter-features.js";

interface Pinned {
  subclassSlug: string | null;
  name: string;
  level: number;
  description: string;
}

// SRD 5.2 pp. 47-48
const BASE_2024: Pinned[] = [
  {
    subclassSlug: null,
    name: "Fighting Style",
    level: 1,
    description:
      "You gain a Fighting Style feat of your choice: Archery, Defense, Great Weapon Fighting, or Two-Weapon Fighting. Whenever you gain a Fighter level, you can replace the feat you chose with a different Fighting Style feat.",
  },
  {
    subclassSlug: null,
    name: "Second Wind",
    level: 1,
    description:
      "As a Bonus Action, regain Hit Points equal to 1d10 plus your Fighter level. You have 2 uses of this feature (3 at level 4, 4 at level 10). You regain one expended use when you finish a Short Rest, and you regain all expended uses when you finish a Long Rest.",
  },
  {
    subclassSlug: null,
    name: "Weapon Mastery",
    level: 1,
    description:
      "You use the mastery properties of three kinds of Simple or Martial weapons of your choice (4 at level 4, 5 at level 10, 6 at level 16). Whenever you finish a Long Rest, you can change one of those weapon choices.",
  },
  {
    subclassSlug: null,
    name: "Action Surge",
    level: 2,
    description:
      "Take one additional action on your turn, except the Magic action. Regain your use of this feature on a Short or Long Rest. You have 2 uses starting at level 17, but only once on a turn.",
  },
  {
    subclassSlug: null,
    name: "Tactical Mind",
    level: 2,
    description:
      "When you fail an ability check, you can expend a use of your Second Wind to roll 1d10 and add the number rolled to the check, potentially turning failure into success. If the check still fails, this use of Second Wind isn't expended.",
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    description: "You can attack twice instead of once whenever you take the Attack action on your turn.",
  },
  {
    subclassSlug: null,
    name: "Tactical Shift",
    level: 5,
    description:
      "Whenever you activate your Second Wind with a Bonus Action, you can move up to half your Speed without provoking Opportunity Attacks.",
  },
  {
    subclassSlug: null,
    name: "Indomitable",
    level: 9,
    description:
      "Reroll a failed saving throw, adding a bonus equal to your Fighter level, and use the new roll. Two uses at level 13, three at level 17. Regain expended uses on a Long Rest.",
  },
  {
    subclassSlug: null,
    name: "Tactical Master",
    level: 9,
    description:
      "When you hit a creature with an attack that can use a weapon mastery property, you can replace that property with Push, Sap, or Slow for that attack.",
  },
  {
    subclassSlug: null,
    name: "Two Extra Attacks",
    level: 11,
    description: "You can attack three times whenever you take the Attack action on your turn.",
  },
  {
    subclassSlug: null,
    name: "Studied Attacks",
    level: 13,
    description:
      "Whenever you miss with an attack roll against a creature, you have Advantage on your next attack roll against that creature before the end of your next turn.",
  },
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    description: "You gain an Epic Boon feat of your choice (Boon of Combat Prowess recommended). You can take this feat only once.",
  },
  {
    subclassSlug: null,
    name: "Three Extra Attacks",
    level: 20,
    description: "You can attack four times whenever you take the Attack action on your turn.",
  },
];

// SRD 5.2 p. 49
const CHAMPION_2024: Pinned[] = [
  {
    subclassSlug: "fighter-champion",
    name: "Improved Critical",
    level: 3,
    description: "Your weapon attacks and Unarmed Strikes score a critical hit on a roll of 19 or 20.",
  },
  {
    subclassSlug: "fighter-champion",
    name: "Remarkable Athlete",
    level: 3,
    description:
      "You have Advantage on Initiative rolls and Strength (Athletics) checks. Immediately after you score a Critical Hit, you can move up to half your Speed without provoking Opportunity Attacks.",
  },
  {
    subclassSlug: "fighter-champion",
    name: "Additional Fighting Style",
    level: 7,
    description: "You gain another Fighting Style feat of your choice.",
  },
  {
    subclassSlug: "fighter-champion",
    name: "Heroic Warrior",
    level: 10,
    description: "During combat, you can give yourself Heroic Inspiration whenever you start your turn without it.",
  },
  {
    subclassSlug: "fighter-champion",
    name: "Superior Critical",
    level: 15,
    description: "Your weapon attacks and Unarmed Strikes score a critical hit on a roll of 18, 19, or 20.",
  },
  {
    subclassSlug: "fighter-champion",
    name: "Survivor",
    level: 18,
    description:
      "Defy Death: you have Advantage on Death Saving Throws, and rolling 18-20 on one counts as a 20 outright. Heroic Rally: at the start of each of your turns, regain Hit Points equal to 5 plus your Constitution modifier while you are Bloodied and have at least 1 Hit Point.",
  },
];

// PHB'24 (mirror-sourced; not in SRD 5.2)
const BATTLE_MASTER_2024: Pinned[] = [
  {
    subclassSlug: "fighter-battle-master",
    name: "Combat Superiority",
    level: 3,
    description:
      "You learn maneuvers fueled by Superiority Dice. You have 4 d8s (5 at level 7, 6 at level 15), and you know 3 maneuvers (5 at level 7, 7 at level 10, 9 at level 15). The save DC for a maneuver that requires one equals 8 + your Proficiency Bonus + your Strength or Dexterity modifier. You regain all expended dice on a short or long rest.",
  },
  {
    subclassSlug: "fighter-battle-master",
    name: "Student of War",
    level: 3,
    description:
      "You gain proficiency with one type of artisan's tools of your choice, and you gain proficiency in one skill of your choice from the Fighter's level 1 skill list.",
  },
  {
    subclassSlug: "fighter-battle-master",
    name: "Know Your Enemy",
    level: 7,
    description:
      "As a Bonus Action, choose a creature you can see within 30 feet of yourself and learn whether it has any damage Immunities, Resistances, or Vulnerabilities, and what they are if any. You can use this feature once, and you regain your use of it when you finish a Long Rest or when you expend a Superiority Die to restore it (no action required).",
  },
  {
    subclassSlug: "fighter-battle-master",
    name: "Improved Combat Superiority (d10)",
    level: 10,
    description: "Your Superiority Dice turn into d10s.",
  },
  {
    subclassSlug: "fighter-battle-master",
    name: "Relentless",
    level: 15,
    description:
      "Once per turn when you use a maneuver, you can roll 1d8 and use the number rolled instead of expending a Superiority Die.",
  },
  {
    subclassSlug: "fighter-battle-master",
    name: "Ultimate Combat Superiority",
    level: 18,
    description: "Your Superiority Dice turn into d12s.",
  },
];

// Eldritch Knight rows are untagged in fighter-features.ts (#1531), so 2024 equals 2014 here — pinned explicitly, not just disclosed.
const ELDRITCH_KNIGHT_2024_EQUALS_2014: Pinned[] = [
  {
    subclassSlug: "fighter-eldritch-knight",
    name: "Eldritch Knight Spellcasting",
    level: 3,
    description:
      "You learn spells from the wizard list (primarily abjuration and evocation), casting with Intelligence. Third-caster progression: spell slots start at level 3. You know cantrips and a limited number of spells.",
  },
  {
    subclassSlug: "fighter-eldritch-knight",
    name: "Weapon Bond",
    level: 3,
    description:
      "Perform a 1-hour ritual to bond with up to two weapons. Bonded weapons can't be disarmed and you can summon one to your hand as a bonus action.",
  },
  {
    subclassSlug: "fighter-eldritch-knight",
    name: "War Magic",
    level: 7,
    description: "When you use your action to cast a cantrip, you can make one weapon attack as a bonus action.",
  },
  {
    subclassSlug: "fighter-eldritch-knight",
    name: "Eldritch Strike",
    level: 10,
    description:
      "When you hit a creature with a weapon attack, that creature has disadvantage on the next saving throw it makes against a spell you cast before the end of your next turn.",
  },
  {
    subclassSlug: "fighter-eldritch-knight",
    name: "Arcane Charge",
    level: 15,
    description:
      "When you use your Action Surge, you can teleport up to 30 feet to an unoccupied space you can see, before or after the additional action.",
  },
  {
    subclassSlug: "fighter-eldritch-knight",
    name: "Improved War Magic",
    level: 18,
    description: "When you use your action to cast a spell, you can make one weapon attack as a bonus action.",
  },
];

const PINNED_2024: Pinned[] = [...BASE_2024, ...CHAMPION_2024, ...BATTLE_MASTER_2024, ...ELDRITCH_KNIGHT_2024_EQUALS_2014];

function key(p: { subclassSlug: string | null; name: string }): string {
  return `${p.subclassSlug ?? "null"}::${p.name}`;
}

describe("Fighter EDITION_2024 rows are pinned to SRD 5.2 / mirror-sourced PHB'24 values (never merely 'differs from 2014')", () => {
  it("count matches: exactly the 31 pinned 2024 rows (13 base + 6 Champion + 6 Battle Master + 6 Eldritch Knight residual)", () => {
    const actual2024 = FIGHTER_FEATURES.filter((r) => r.edition === "EDITION_2024");
    expect(actual2024).toHaveLength(PINNED_2024.length);
    expect(PINNED_2024).toHaveLength(31);
  });

  it("every pinned (subclassSlug, name) has an EDITION_2024 row with the exact same level and description", () => {
    const byKey = new Map(FIGHTER_FEATURES.filter((r) => r.edition === "EDITION_2024").map((r) => [key(r), r]));
    for (const pinned of PINNED_2024) {
      const actual = byKey.get(key(pinned));
      expect(actual, `missing EDITION_2024 row for ${key(pinned)}`).toBeDefined();
      expect(actual!.level, key(pinned)).toBe(pinned.level);
      expect(actual!.description, key(pinned)).toBe(pinned.description);
    }
  });

  it("no EXTRA EDITION_2024 row exists beyond the 31 pinned above", () => {
    const actualKeys = new Set(FIGHTER_FEATURES.filter((r) => r.edition === "EDITION_2024").map((r) => key(r)));
    const pinnedKeys = new Set(PINNED_2024.map((p) => key(p)));
    expect(actualKeys).toEqual(pinnedKeys);
  });

  it("Eldritch Knight's EDITION_2024 rows equal their EDITION_2014 twins byte-for-byte (residual pinned, not merely disclosed — #1531 owns authoring real 2024 text)", () => {
    const byKey2014 = new Map(FIGHTER_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => [key(r), r]));
    for (const pinned of ELDRITCH_KNIGHT_2024_EQUALS_2014) {
      const twin2014 = byKey2014.get(key(pinned));
      expect(twin2014, `missing EDITION_2014 twin for ${key(pinned)}`).toBeDefined();
      expect(pinned.level, key(pinned)).toBe(twin2014!.level);
      expect(pinned.description, key(pinned)).toBe(twin2014!.description);
    }
  });
});
