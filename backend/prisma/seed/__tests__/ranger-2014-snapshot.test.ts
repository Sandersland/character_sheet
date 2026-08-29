// This snapshot must stay green and unedited through commit 3 — its job is to catch a later commit silently editing a 2014 row while authoring 2024 content or moving a pool onto a row.
import { describe, expect, it } from "vitest";

import { RANGER_FEATURES } from "../ranger-features.js";

interface Pinned {
  subclassSlug: string | null;
  name: string;
  level: number;
  description: string;
}

const PRE_CHANGE_2014: Pinned[] = [
  {
    subclassSlug: null,
    name: "Favored Enemy",
    level: 1,
    description:
      "Choose a type of favored enemy (beasts, fey, humanoids of a specific type, etc.). You have advantage on Survival checks to track them and on Intelligence checks to recall information about them. You learn one language spoken by your favored enemy. Additional enemy at L6 and L14.",
  },
  {
    subclassSlug: null,
    name: "Natural Explorer",
    level: 1,
    description:
      "Choose a favored terrain type. When traveling in it: ignore difficult terrain, can't be surprised if alert, advantage on Initiative rolls, initiative even if surprised once per turn, move at normal pace while stealthing. Additional terrain at L6 and L10.",
  },
  {
    subclassSlug: null,
    name: "Fighting Style",
    level: 2,
    description:
      "Choose: Archery (+2 ranged attack rolls), Defense (+1 AC in armor), Dueling (+2 melee damage with one weapon), or Two-Weapon Fighting (add ability modifier to off-hand damage).",
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 2,
    description:
      "You cast spells using Wisdom. Half-caster progression (first slots at level 2, one level behind full casters). You prepare a number of ranger spells equal to half your ranger level + Wisdom modifier (minimum 1).",
  },
  {
    subclassSlug: null,
    name: "Primeval Awareness",
    level: 3,
    description:
      "Expend one spell slot to focus your awareness for 1 minute per slot level. You sense whether certain types of creatures are within 1 mile (or 6 miles in your favored terrain).",
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    description: "You can attack twice whenever you take the Attack action on your turn.",
  },
  {
    subclassSlug: null,
    name: "Land's Stride",
    level: 8,
    description:
      "Moving through nonmagical difficult terrain costs no extra movement. You can pass through nonmagical plants without being slowed or taking damage. Advantage on saves against magically created or manipulated plants.",
  },
  {
    subclassSlug: null,
    name: "Hide in Plain Sight",
    level: 10,
    description:
      "Spend 1 minute camouflaging yourself: gain +10 to Dexterity (Stealth) checks while you remain motionless. The bonus is lost when you move, take an action, or take a reaction.",
  },
  {
    subclassSlug: null,
    name: "Vanish",
    level: 14,
    description:
      "You can use the Hide action as a bonus action on your turn. Also, you can't be tracked by nonmagical means unless you choose to leave a trail.",
  },
  {
    subclassSlug: null,
    name: "Feral Senses",
    level: 18,
    description:
      "When not blinded or deafened, you are aware of invisible creatures within 30 ft even if they are hidden. In combat, no disadvantage on attacks against invisible creatures within 30 ft.",
  },
  {
    subclassSlug: null,
    name: "Foe Slayer",
    level: 20,
    description:
      "Once per turn when you hit a favored enemy with a weapon, you may add your Wisdom modifier to the attack roll or the damage roll.",
  },
  {
    subclassSlug: "ranger-hunter",
    name: "Hunter's Prey",
    level: 3,
    description:
      "Choose one: Colossus Slayer (once per turn, +1d8 damage to a wounded creature); Giant Killer (reaction attack when a Large+ creature misses you); or Horde Breaker (once per turn, attack a second creature adjacent to the first).",
  },
  {
    subclassSlug: "ranger-hunter",
    name: "Defensive Tactics",
    level: 7,
    description:
      "Choose one: Escape the Horde (opportunity attacks against you have disadvantage); Multiattack Defense (+4 AC against other attacks after being hit by one); or Steel Will (advantage on saves against being frightened).",
  },
  {
    subclassSlug: "ranger-hunter",
    name: "Multiattack",
    level: 11,
    description:
      "Choose one: Volley (action: ranged attack against every creature in a 10-ft radius within range); or Whirlwind Attack (action: melee attack against every creature within reach).",
  },
  {
    subclassSlug: "ranger-hunter",
    name: "Superior Hunter's Defense",
    level: 15,
    description:
      "Choose one: Evasion (no damage on successful Dex save, half on failure); Stand Against the Tide (redirect a missed melee attack to another creature within range); or Uncanny Dodge (halve damage from one attack per reaction).",
  },
  {
    subclassSlug: "ranger-beast-master",
    name: "Ranger's Companion",
    level: 3,
    description:
      "Bond with a beast companion of CR 1/4 or lower. It acts on your turn (using your action to command it after the first round). It uses your proficiency bonus and gains bonus HP equal to four times your ranger level.",
  },
  {
    subclassSlug: "ranger-beast-master",
    name: "Exceptional Training",
    level: 7,
    description:
      "Use a bonus action to command your companion to Dash, Disengage, Dodge, or Help. Its attacks count as magical.",
  },
  {
    subclassSlug: "ranger-beast-master",
    name: "Bestial Fury",
    level: 11,
    description: "Your companion can make two attacks when you command it to attack.",
  },
  {
    subclassSlug: "ranger-beast-master",
    name: "Share Spells",
    level: 15,
    description: "When you cast a spell targeting yourself, you can also affect your companion if it is within 30 ft.",
  },
];

function key(p: { subclassSlug: string | null; name: string }): string {
  return `${p.subclassSlug ?? "null"}::${p.name}`;
}

describe("Ranger EDITION_2014 rows are byte-identical to the pre-#1230 tree (2014 is a transcription, not a rewrite)", () => {
  it("count matches: exactly the 19 pre-change 2014 features", () => {
    const actual2014 = RANGER_FEATURES.filter((r) => r.edition === "EDITION_2014");
    expect(actual2014).toHaveLength(PRE_CHANGE_2014.length);
    expect(PRE_CHANGE_2014).toHaveLength(19);
  });

  it("every pinned (subclassSlug, name) has an EDITION_2014 row with the exact same level and description", () => {
    const byKey = new Map(RANGER_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => [key(r), r]));
    for (const pinned of PRE_CHANGE_2014) {
      const actual = byKey.get(key(pinned));
      expect(actual, `missing EDITION_2014 row for ${key(pinned)}`).toBeDefined();
      expect(actual!.level, key(pinned)).toBe(pinned.level);
      expect(actual!.description, key(pinned)).toBe(pinned.description);
    }
  });

  it("no EXTRA EDITION_2014 row exists beyond the 19 pinned above", () => {
    const actualKeys = new Set(RANGER_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => key(r)));
    const pinnedKeys = new Set(PRE_CHANGE_2014.map((p) => key(p)));
    expect(actualKeys).toEqual(pinnedKeys);
  });
});
