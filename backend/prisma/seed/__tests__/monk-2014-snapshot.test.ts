// #1675: Monk's EDITION_2014 rows must be byte-identical transcriptions of
// what monk.ts's MONK_FEATURES/WARRIOR_OF_*_FEATURES + class-features.ts's
// (retired) expandFeatureRow said BEFORE this migration — 2014 is a
// transcription here, not a rewrite (the real SRD 5.1 rewrite is
// #1500-#1503's job). This snapshot is that pre-change text, captured by
// running the pre-#1675 tree's own derivation (collectRawFeatures +
// expandFeatureRow, scoped to Monk) and pinned by hand — a hardcoded oracle,
// not re-derived from anything this migration touches, same shape as
// fighter-2014-snapshot.test.ts.
import { describe, expect, it } from "vitest";

import { MONK_FEATURES } from "../monk-features.js";

interface Pinned {
  subclassSlug: string | null;
  name: string;
  level: number;
  description: string;
}

const PRE_CHANGE_2014: Pinned[] = [
  // ---- Base class ------------------------------------------------------
  {
    subclassSlug: null,
    name: "Unarmored Defense",
    level: 1,
    description:
      "While not wearing armor or wielding a shield, your AC equals 10 + your Dexterity modifier + your Wisdom modifier.",
  },
  {
    subclassSlug: null,
    name: "Martial Arts",
    level: 1,
    description:
      "With unarmed strikes or monk weapons: use Dexterity instead of Strength for attack and damage rolls; deal 1d6 (L1–4), 1d8 (L5–10), 1d10 (L11–16), or 1d12 (L17+) damage; make one bonus unarmed strike after the Attack action.",
  },
  {
    subclassSlug: null,
    name: "Focus",
    level: 2,
    description:
      "You have a pool of Focus Points equal to your monk level. Spend them to fuel: Flurry of Blows (1 focus — two bonus unarmed strikes), Patient Defense (free for Disengage as a bonus action, or 1 focus for Disengage + Dodge), Step of the Wind (free for Dash as a bonus action, or 1 focus for Disengage + Dash with jump distance doubled). Focus save DC = 8 + proficiency + Wisdom modifier. Regain all focus on a short or long rest.",
  },
  {
    subclassSlug: null,
    name: "Unarmored Movement",
    level: 2,
    description:
      "Your speed increases by 10 ft while unarmored and unshielded (+15 at L6; +20 at L10; +25 at L14; +30 at L18). At level 9, you can run up vertical surfaces and across liquids on your turn.",
  },
  {
    subclassSlug: null,
    name: "Uncanny Metabolism",
    level: 2,
    description:
      "When you roll initiative, you can regain all expended Focus Points; when you do, roll your Martial Arts die and regain hit points equal to your monk level plus the number rolled. Usable once per long rest.",
  },
  {
    subclassSlug: null,
    name: "Deflect Attacks",
    level: 3,
    description:
      "Use your reaction to reduce bludgeoning, piercing, or slashing damage from a melee or ranged attack that hits you by 1d10 + Dexterity modifier + monk level. If this reduces the damage to 0, spend 1 focus to redirect it: the attacker (melee, within 5 ft) or another creature (ranged, within 60 ft) must succeed on a Dexterity save or take damage equal to two rolls of your Martial Arts die + your Dexterity modifier.",
  },
  {
    subclassSlug: null,
    name: "Slow Fall",
    level: 4,
    description: "Use your reaction to reduce falling damage by 5 × your monk level.",
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    description: "You can attack twice whenever you take the Attack action on your turn.",
  },
  {
    subclassSlug: null,
    name: "Stunning Strike",
    level: 5,
    description:
      "Once per turn when you hit with a monk weapon or unarmed strike, spend 1 focus to attempt a stunning strike. The target makes a Constitution save (focus save DC): on a failure it is stunned until the end of your next turn; on a success its speed is halved until the start of your next turn.",
  },
  {
    subclassSlug: null,
    name: "Empowered Strikes",
    level: 6,
    description:
      "Your unarmed strikes count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks, and can deal force damage instead of their normal damage type.",
  },
  {
    subclassSlug: null,
    name: "Evasion",
    level: 7,
    description:
      "When subjected to an effect that allows a Dexterity save for half damage, you take no damage on a success and half damage on a failure.",
  },
  {
    subclassSlug: null,
    name: "Heightened Focus",
    level: 10,
    description:
      "Your focus features grow more potent: Flurry of Blows lets you make three unarmed strikes instead of two (still 1 focus); Patient Defense grants temporary hit points equal to two rolls of your Martial Arts die when you spend focus; Step of the Wind lets you bring one willing Large or smaller creature within 5 ft along with you when you spend focus.",
  },
  {
    subclassSlug: null,
    name: "Self-Restoration",
    level: 10,
    description:
      "At the end of each of your turns, you can end one Charmed, Frightened, or Poisoned effect on yourself for free. You also no longer suffer exhaustion from lack of food or water.",
  },
  {
    subclassSlug: null,
    name: "Deflect Energy",
    level: 13,
    description:
      "Your Deflect Attacks feature now works against an attack of any damage type, not just bludgeoning, piercing, or slashing.",
  },
  {
    subclassSlug: null,
    name: "Disciplined Survivor",
    level: 14,
    description:
      "You gain proficiency in all saving throws. Additionally, whenever you fail a saving throw, you can spend 1 focus to reroll it and take the second result.",
  },
  {
    subclassSlug: null,
    name: "Perfect Focus",
    level: 15,
    description:
      "When you roll initiative, if you have 3 or fewer focus points, you regain focus points until you have 4.",
  },
  {
    subclassSlug: null,
    name: "Superior Defense",
    level: 18,
    description:
      "At the start of your turn, spend 3 focus to bolster yourself for 1 minute or until you're incapacitated: during that time you have resistance to all damage except force damage.",
  },
  {
    subclassSlug: null,
    name: "Body and Mind",
    level: 20,
    description: "Your Dexterity and Wisdom scores each increase by 4, to a maximum of 25.",
  },
  // ---- Warrior of the Open Hand -----------------------------------------
  {
    subclassSlug: "monk-warrior-of-the-open-hand",
    name: "Open Hand Technique",
    level: 3,
    description:
      "When you hit a creature with an attack granted by your Flurry of Blows, you can impose one effect: Addle — the creature can't take reactions until the start of its next turn (no save); Push — the creature makes a Strength save or is pushed up to 15 ft away; or Topple — the creature makes a Dexterity save or is knocked prone.",
  },
  {
    subclassSlug: "monk-warrior-of-the-open-hand",
    name: "Wholeness of Body",
    level: 6,
    description:
      "As a bonus action, roll your Martial Arts die and regain that many hit points plus your Wisdom modifier (minimum 1). Usable a number of times equal to your Wisdom modifier (minimum once); regain all expended uses on a long rest.",
  },
  {
    subclassSlug: "monk-warrior-of-the-open-hand",
    name: "Fleet Step",
    level: 11,
    description:
      "When you take a bonus action other than Step of the Wind, you can also take the Step of the Wind bonus action immediately afterward.",
  },
  {
    subclassSlug: "monk-warrior-of-the-open-hand",
    name: "Quivering Palm",
    level: 17,
    description:
      "When you hit with an unarmed strike, spend 4 focus to set imperceptible vibrations in the creature that last for a number of days equal to your monk level. They are harmless unless you use your action to end them — the creature then makes a Constitution save, taking 10d12 force damage on a failure or half as much on a success. You can maintain vibrations in only one creature at a time and can end them harmlessly at any time without using an action.",
  },
  // ---- Warrior of Shadow -------------------------------------------------
  {
    subclassSlug: "monk-warrior-of-shadow",
    name: "Shadow Arts",
    level: 3,
    description:
      "You know the Minor Illusion cantrip (Wisdom). Spend 1 focus to cast Darkness without material components; you can see through the darkness you create, and while it persists you can move it up to 30 ft as a bonus action. You also have Darkvision out to 60 ft, or your Darkvision's range increases by 60 ft if you already have it.",
  },
  {
    subclassSlug: "monk-warrior-of-shadow",
    name: "Shadow Step",
    level: 6,
    description:
      "While in dim light or darkness, teleport as a bonus action to an unoccupied space you can see that is also in dim light or darkness (up to 60 ft), then make one unarmed strike as part of the same bonus action. You have advantage on the first melee attack you make before the end of the turn.",
  },
  {
    subclassSlug: "monk-warrior-of-shadow",
    name: "Improved Shadow Step",
    level: 11,
    description:
      "When you Shadow Step, you can spend 1 focus to ignore the requirement that your destination be in dim light or darkness.",
  },
  {
    subclassSlug: "monk-warrior-of-shadow",
    name: "Cloak of Shadows",
    level: 17,
    description:
      "Spend 3 focus and use your action to become invisible and able to move through other creatures and objects as if they were difficult terrain, for 1 minute or until you're incapacitated. The invisibility ends early if you attack or cast a spell. While it lasts, Flurry of Blows costs no focus.",
  },
  // ---- Warrior of the Elements --------------------------------------------
  {
    subclassSlug: "monk-warrior-of-the-elements",
    name: "Manipulate Elements",
    level: 3,
    description: "You know the Elementalism cantrip. Wisdom is your spellcasting ability for it.",
  },
  {
    subclassSlug: "monk-warrior-of-the-elements",
    name: "Elemental Attunement",
    level: 3,
    description:
      "At the start of your turn, you can expend 1 Focus Point (no action) to imbue yourself with elemental energy for 10 minutes (or until you're Incapacitated). While attuned: your Unarmed Strike reach increases by 10 ft; and once per Unarmed Strike hit you can deal Acid, Cold, Fire, Lightning, or Thunder damage instead of the normal type — when you do, you can force the target to make a Strength saving throw (your focus save DC), moving it up to 10 ft in a direction of your choice on a failure.",
  },
  {
    subclassSlug: "monk-warrior-of-the-elements",
    name: "Elemental Burst",
    level: 6,
    description:
      "As a Magic action, you can expend 2 Focus Points to create a 20-foot-radius sphere of elemental energy centered on a point within 120 ft. Choose Acid, Cold, Fire, Lightning, or Thunder. Each creature in the sphere makes a Dexterity saving throw (your focus save DC), taking damage equal to three rolls of your Martial Arts die of the chosen type on a failure, or half as much on a success.",
  },
  {
    subclassSlug: "monk-warrior-of-the-elements",
    name: "Stride of the Elements",
    level: 11,
    description: "While your Elemental Attunement is active, you have a Fly Speed and a Swim Speed each equal to your Speed.",
  },
  {
    subclassSlug: "monk-warrior-of-the-elements",
    name: "Elemental Epitome",
    level: 17,
    description:
      "While your Elemental Attunement is active you gain: Resistance to Acid, Cold, Fire, Lightning, or Thunder damage (choose one at the start of each of your turns); Destructive Stride (when you use Step of the Wind, your Speed increases by 20 ft that turn, and the first creature you move within 5 ft of takes one roll of your Martial Arts die of your chosen resistance type); and Empowered Strikes (once per turn, one Unarmed Strike deals an extra Martial Arts die of your chosen resistance type on a hit).",
  },
  // ---- Warrior of Mercy ---------------------------------------------------
  {
    subclassSlug: "monk-warrior-of-mercy",
    name: "Implements of Mercy",
    level: 3,
    description: "You gain proficiency in the Insight and Medicine skills and with the Herbalism Kit.",
  },
  {
    subclassSlug: "monk-warrior-of-mercy",
    name: "Hand of Harm",
    level: 3,
    description:
      "Once per turn when you hit a creature with an unarmed strike and deal damage, you can expend 1 focus to deal extra necrotic damage equal to one Martial Arts die plus your Wisdom modifier.",
  },
  {
    subclassSlug: "monk-warrior-of-mercy",
    name: "Hand of Healing",
    level: 3,
    description:
      "As a Magic action, expend 1 focus to touch a creature and restore hit points equal to one Martial Arts die plus your Wisdom modifier. When you use Flurry of Blows, you can replace one of its unarmed strikes with this effect without spending the extra focus for the heal — Flurry's own focus cost still applies.",
  },
  {
    subclassSlug: "monk-warrior-of-mercy",
    name: "Physician's Touch",
    level: 6,
    description:
      "Hand of Harm also inflicts the Poisoned condition on the target until the end of your next turn. Hand of Healing also ends one of the following conditions on the target: Blinded, Deafened, Paralyzed, Poisoned, or Stunned.",
  },
  {
    subclassSlug: "monk-warrior-of-mercy",
    name: "Flurry of Healing and Harm",
    level: 11,
    description:
      "When you use Flurry of Blows, you can replace each of its unarmed strikes with Hand of Healing, and you can apply Hand of Harm to one of its strikes without spending focus (Hand of Harm's once-per-turn limit still applies). Usable a number of times equal to your Wisdom modifier (minimum once) per long rest.",
  },
  {
    subclassSlug: "monk-warrior-of-mercy",
    name: "Hand of Ultimate Mercy",
    level: 17,
    description:
      "As a Magic action, expend 5 focus to touch a creature that died no more than 24 hours ago and return it to life with 4d10 plus your Wisdom modifier hit points, ending the Blinded, Deafened, Paralyzed, Poisoned, and Stunned conditions on it. Usable once per long rest.",
  },
];

function key(p: { subclassSlug: string | null; name: string }): string {
  return `${p.subclassSlug ?? "null"}::${p.name}`;
}

describe("Monk EDITION_2014 rows are byte-identical to the pre-#1675 tree (2014 is a transcription, not a rewrite)", () => {
  it("count matches: exactly the 37 pre-change 2014 features", () => {
    const actual2014 = MONK_FEATURES.filter((r) => r.edition === "EDITION_2014");
    expect(actual2014).toHaveLength(PRE_CHANGE_2014.length);
    expect(PRE_CHANGE_2014).toHaveLength(37);
  });

  it("every pinned (subclassSlug, name) has an EDITION_2014 row with the exact same level and description", () => {
    const byKey = new Map(MONK_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => [key(r), r]));
    for (const pinned of PRE_CHANGE_2014) {
      const actual = byKey.get(key(pinned));
      expect(actual, `missing EDITION_2014 row for ${key(pinned)}`).toBeDefined();
      expect(actual!.level, key(pinned)).toBe(pinned.level);
      expect(actual!.description, key(pinned)).toBe(pinned.description);
    }
  });

  it("no EXTRA EDITION_2014 row exists beyond the 37 pinned above", () => {
    const actualKeys = new Set(MONK_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => key(r)));
    const pinnedKeys = new Set(PRE_CHANGE_2014.map((p) => key(p)));
    expect(actualKeys).toEqual(pinnedKeys);
  });

  // #1675's own AC: EDITION_2024 is byte-identical to EDITION_2014 in this
  // slice (the 2014 rewrite is #1500-#1503's job) — every untagged feature
  // expands to two rows with the SAME text, so the pinned 2014 set above
  // doubles as the 2024 pin too.
  it("every EDITION_2024 row equals its EDITION_2014 twin (no edition fork in this slice)", () => {
    const by2014 = new Map(MONK_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => [key(r), r]));
    const rows2024 = MONK_FEATURES.filter((r) => r.edition === "EDITION_2024");
    expect(rows2024).toHaveLength(PRE_CHANGE_2014.length);
    for (const row2024 of rows2024) {
      const twin = by2014.get(key(row2024));
      expect(twin, `missing EDITION_2014 twin for ${key(row2024)}`).toBeDefined();
      expect(row2024.level).toBe(twin!.level);
      expect(row2024.description).toBe(twin!.description);
    }
  });
});
