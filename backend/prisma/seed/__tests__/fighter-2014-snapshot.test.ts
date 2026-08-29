import { describe, expect, it } from "vitest";

import { FIGHTER_FEATURES } from "../fighter-features.js";

interface Pinned {
  subclassSlug: string | null;
  name: string;
  level: number;
  description: string;
}

const PRE_CHANGE_2014: Pinned[] = [
  {
    subclassSlug: null,
    name: "Fighting Style",
    level: 1,
    description:
      "Choose a fighting style specialty: Archery (+2 ranged attack rolls), Defense (+1 AC in armor), Dueling (+2 melee damage when only wielding one weapon), Great Weapon Fighting (reroll 1s and 2s on damage with two-handed weapons), Protection (impose disadvantage on attacks against adjacent allies), or Two-Weapon Fighting (add ability modifier to off-hand damage).",
  },
  {
    subclassSlug: null,
    name: "Second Wind",
    level: 1,
    description: "As a bonus action, regain 1d10 + your fighter level HP. Regain use on a short or long rest.",
  },
  {
    subclassSlug: null,
    name: "Action Surge",
    level: 2,
    description:
      "Take one additional action on your turn. Regain use(s) on a short or long rest. You have 2 uses starting at level 17.",
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    description: "You can attack twice when taking the Attack action. Three times at level 11; four times at level 20.",
  },
  {
    subclassSlug: null,
    name: "Indomitable",
    level: 9,
    description:
      "Reroll a failed saving throw (you must use the new roll). Regain use(s) on a long rest. Two uses at level 13, three at level 17.",
  },
  {
    subclassSlug: "fighter-champion",
    name: "Improved Critical",
    level: 3,
    description: "Your weapon attacks score a critical hit on a roll of 19 or 20.",
  },
  {
    subclassSlug: "fighter-champion",
    name: "Remarkable Athlete",
    level: 7,
    description:
      "Add half your proficiency bonus (rounded up) to Strength, Dexterity, or Constitution checks that don't already use your proficiency bonus. Running long jump distance increases by your Strength modifier in feet.",
  },
  {
    subclassSlug: "fighter-champion",
    name: "Additional Fighting Style",
    level: 10,
    description: "Choose a second option from the Fighting Style class feature.",
  },
  {
    subclassSlug: "fighter-champion",
    name: "Superior Critical",
    level: 15,
    description: "Your weapon attacks score a critical hit on a roll of 18, 19, or 20.",
  },
  {
    subclassSlug: "fighter-champion",
    name: "Survivor",
    level: 18,
    description:
      "At the start of each of your turns, regain HP equal to 5 + your Constitution modifier if you are at or below half your hit point maximum (and not at 0 HP).",
  },
  {
    subclassSlug: "fighter-battle-master",
    name: "Combat Superiority",
    level: 3,
    description:
      "You learn maneuvers fueled by superiority dice (d8s). You have 4 dice and regain all expended dice on a short or long rest. Maneuvers can only be used once per attack unless otherwise stated.",
  },
  {
    subclassSlug: "fighter-battle-master",
    name: "Student of War",
    level: 3,
    description: "You gain proficiency with one type of artisan's tools of your choice.",
  },
  {
    subclassSlug: "fighter-battle-master",
    name: "Know Your Enemy",
    level: 7,
    description:
      "If you spend at least 1 minute observing or interacting with another creature outside combat, you can compare two of its ability scores, armor class, hit points, hit dice, or levels to your own.",
  },
  {
    subclassSlug: "fighter-battle-master",
    name: "Improved Combat Superiority (d10)",
    level: 10,
    description: "Your superiority dice turn into d10s.",
  },
  {
    subclassSlug: "fighter-battle-master",
    name: "Relentless",
    level: 15,
    description: "When you roll initiative and have no superiority dice remaining, you regain 1 superiority die.",
  },
  {
    subclassSlug: "fighter-battle-master",
    name: "Improved Combat Superiority (d12)",
    level: 18,
    description: "Your superiority dice turn into d12s.",
  },
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

function key(p: { subclassSlug: string | null; name: string }): string {
  return `${p.subclassSlug ?? "null"}::${p.name}`;
}

describe("Fighter EDITION_2014 rows are byte-identical to the pre-#1227 tree (2014 is a transcription, not a rewrite)", () => {
  it("count matches: exactly the 22 pre-change 2014 features", () => {
    const actual2014 = FIGHTER_FEATURES.filter((r) => r.edition === "EDITION_2014");
    expect(actual2014).toHaveLength(PRE_CHANGE_2014.length);
    expect(PRE_CHANGE_2014).toHaveLength(22);
  });

  it("every pinned (subclassSlug, name) has an EDITION_2014 row with the exact same level and description", () => {
    const byKey = new Map(FIGHTER_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => [key(r), r]));
    for (const pinned of PRE_CHANGE_2014) {
      const actual = byKey.get(key(pinned));
      expect(actual, `missing EDITION_2014 row for ${key(pinned)}`).toBeDefined();
      expect(actual!.level, key(pinned)).toBe(pinned.level);
      expect(actual!.description, key(pinned)).toBe(pinned.description);
    }
  });

  it("no EXTRA EDITION_2014 row exists beyond the 22 pinned above", () => {
    const actualKeys = new Set(FIGHTER_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => key(r)));
    const pinnedKeys = new Set(PRE_CHANGE_2014.map((p) => key(p)));
    expect(actualKeys).toEqual(pinnedKeys);
  });
});
