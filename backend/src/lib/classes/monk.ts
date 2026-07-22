import { abilityModifier } from "@/lib/srd/srd.js";

import type { ClassDefinition, DerivedFeature } from "./types.js";

/** Elemental discipline count by Monk level (Way of the Four Elements). */
function fourElementsDisciplineCount(level: number): number {
  if (level >= 17) return 4;
  if (level >= 11) return 3;
  if (level >= 6) return 2;
  return 1;
}

/** Focus save DC (Monk) — used by Stunning Strike, focus features, and elemental disciplines. */
function focusSaveDC(abilityScores: Record<string, number>, profBonus: number): number {
  return 8 + profBonus + abilityModifier(abilityScores.wisdom ?? 10);
}

const MONK_FEATURES: DerivedFeature[] = [
  {
    name: "Unarmored Defense",
    level: 1,
    source: "class",
    description:
      "While not wearing armor or wielding a shield, your AC equals 10 + your Dexterity modifier + your Wisdom modifier.",
  },
  {
    name: "Martial Arts",
    level: 1,
    source: "class",
    description:
      "With unarmed strikes or monk weapons: use Dexterity instead of Strength for attack and damage rolls; deal 1d6 (L1–4), 1d8 (L5–10), 1d10 (L11–16), or 1d12 (L17+) damage; make one bonus unarmed strike after the Attack action.",
  },
  {
    name: "Focus",
    level: 2,
    source: "class",
    description:
      "You have a pool of Focus Points equal to your monk level. Spend them to fuel: Flurry of Blows (2 focus — two bonus unarmed strikes), Patient Defense (1 focus — Dodge as bonus action), Step of the Wind (1 focus — Disengage or Dash as bonus action, jump distance doubled). Focus save DC = 8 + proficiency + Wisdom modifier. Regain all focus on a short or long rest.",
  },
  {
    name: "Unarmored Movement",
    level: 2,
    source: "class",
    description:
      "Your speed increases by 10 ft while unarmored and unshielded (+15 at L6; +20 at L10; +25 at L14; +30 at L18). At level 9, you can run up vertical surfaces and across liquids on your turn.",
  },
  {
    name: "Uncanny Metabolism",
    level: 2,
    source: "class",
    description:
      "When you roll initiative, you can regain all expended Focus Points; when you do, roll your Martial Arts die and regain hit points equal to your monk level plus the number rolled. Usable once per long rest.",
  },
  {
    name: "Deflect Attacks",
    level: 3,
    source: "class",
    description:
      "Use your reaction to reduce bludgeoning, piercing, or slashing damage from a melee or ranged attack that hits you by 1d10 + Dexterity modifier + monk level. If this reduces the damage to 0, spend 1 focus to redirect it: the attacker (melee, within 5 ft) or another creature (ranged, within 60 ft) must succeed on a Dexterity save or take damage equal to two rolls of your Martial Arts die + your Dexterity modifier.",
  },
  {
    name: "Slow Fall",
    level: 4,
    source: "class",
    description:
      "Use your reaction to reduce falling damage by 5 × your monk level.",
  },
  {
    name: "Extra Attack",
    level: 5,
    source: "class",
    description: "You can attack twice whenever you take the Attack action on your turn.",
  },
  {
    name: "Stunning Strike",
    level: 5,
    source: "class",
    description:
      "Once per turn when you hit with a monk weapon or unarmed strike, spend 1 focus to attempt a stunning strike. The target makes a Constitution save (focus save DC): on a failure it is stunned until the end of your next turn; on a success its speed is halved until the start of your next turn.",
  },
  {
    name: "Empowered Strikes",
    level: 6,
    source: "class",
    description:
      "Your unarmed strikes count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks, and can deal force damage instead of their normal damage type.",
  },
  {
    name: "Evasion",
    level: 7,
    source: "class",
    description:
      "When subjected to an effect that allows a Dexterity save for half damage, you take no damage on a success and half damage on a failure.",
  },
  {
    name: "Heightened Focus",
    level: 10,
    source: "class",
    description:
      "Your focus features grow more potent: Flurry of Blows lets you make three unarmed strikes for 1 focus (instead of two); Patient Defense grants temporary hit points equal to two rolls of your Martial Arts die when you spend focus; Step of the Wind lets you bring one willing Large or smaller creature within 5 ft along with you when you spend focus.",
  },
  {
    name: "Self-Restoration",
    level: 10,
    source: "class",
    description:
      "At the end of each of your turns, you can end one Charmed, Frightened, or Poisoned effect on yourself for free. You also no longer suffer exhaustion from lack of food or water.",
  },
  {
    name: "Deflect Energy",
    level: 13,
    source: "class",
    description:
      "Your Deflect Attacks feature now works against an attack of any damage type, not just bludgeoning, piercing, or slashing.",
  },
  {
    name: "Disciplined Survivor",
    level: 14,
    source: "class",
    description:
      "You gain proficiency in all saving throws. Additionally, whenever you fail a saving throw, you can spend 1 focus to reroll it and take the second result.",
  },
  {
    name: "Perfect Focus",
    level: 15,
    source: "class",
    description:
      "When you roll initiative, if you have 3 or fewer focus points, you regain focus points until you have 4.",
  },
  {
    name: "Superior Defense",
    level: 18,
    source: "class",
    description:
      "At the start of your turn, spend 3 focus to bolster yourself for 1 minute or until you're incapacitated: during that time you have resistance to all damage except force damage.",
  },
  {
    name: "Body and Mind",
    level: 20,
    source: "class",
    description:
      "Your Dexterity and Wisdom scores each increase by 4, to a maximum of 25.",
  },
];

const WARRIOR_OF_THE_OPEN_HAND_FEATURES: DerivedFeature[] = [
  {
    name: "Open Hand Technique",
    level: 3,
    source: "subclass",
    description:
      "When you hit a creature with an attack granted by your Flurry of Blows, you can impose one effect: Addle — the creature can't take reactions until the start of its next turn (no save); Push — the creature makes a Strength save or is pushed up to 15 ft away; or Topple — the creature makes a Dexterity save or is knocked prone.",
  },
  {
    name: "Wholeness of Body",
    level: 6,
    source: "subclass",
    description:
      "As a bonus action, roll your Martial Arts die and regain that many hit points plus your Wisdom modifier (minimum 1). Usable a number of times equal to your Wisdom modifier (minimum once); regain all expended uses on a long rest.",
  },
  {
    name: "Fleet Step",
    level: 11,
    source: "subclass",
    description:
      "When you take a bonus action other than Step of the Wind, you can also take the Step of the Wind bonus action immediately afterward.",
  },
  {
    name: "Quivering Palm",
    level: 17,
    source: "subclass",
    description:
      "When you hit with an unarmed strike, spend 4 focus to set imperceptible vibrations in the creature that last for a number of days equal to your monk level. They are harmless unless you use your action to end them — the creature then makes a Constitution save, taking 10d12 force damage on a failure or half as much on a success. You can maintain vibrations in only one creature at a time and can end them harmlessly at any time without using an action.",
  },
];

const WAY_OF_SHADOW_FEATURES: DerivedFeature[] = [
  {
    name: "Shadow Arts",
    level: 3,
    source: "subclass",
    description:
      "Spend 2 focus to cast Darkness, Darkvision, Pass without Trace, or Silence — without material components. You also know the Minor Illusion cantrip.",
  },
  {
    name: "Shadow Step",
    level: 6,
    source: "subclass",
    description:
      "When in dim light or darkness, teleport as a bonus action to an unoccupied space you can see that is also in dim light or darkness (up to 60 ft). You have advantage on the first melee attack you make before the end of the turn.",
  },
  {
    name: "Cloak of Shadows",
    level: 11,
    source: "subclass",
    description:
      "When in an area of dim light or darkness, use your action to become invisible. Ends when you attack or cast a spell.",
  },
  {
    name: "Opportunist",
    level: 17,
    source: "subclass",
    description:
      "When a creature within 5 ft is hit by an attack by another creature, use your reaction to make a melee attack against that creature.",
  },
];

const FOUR_ELEMENTS_FEATURES: DerivedFeature[] = [
  {
    name: "Disciple of the Elements",
    level: 3,
    source: "subclass",
    description:
      "You learn magical elemental disciplines fueled by focus. You know the Elemental Attunement discipline plus one elemental discipline of your choice, and learn one additional discipline at levels 6, 11, and 17. Casting an elemental discipline that is a spell costs focus equal to the spell's level; the save DC equals your focus save DC.",
  },
  {
    name: "Additional Elemental Discipline",
    level: 6,
    source: "subclass",
    description: "You learn one additional elemental discipline of your choice.",
  },
  {
    name: "Additional Elemental Discipline",
    level: 11,
    source: "subclass",
    description: "You learn one additional elemental discipline of your choice.",
  },
  {
    name: "Additional Elemental Discipline",
    level: 17,
    source: "subclass",
    description: "You learn one additional elemental discipline of your choice.",
  },
];

export const monk: ClassDefinition = {
  features: MONK_FEATURES,
  resourceFn: (level, abilityScores, profBonus) => {
    if (level < 2) return [];
    const focusDC = focusSaveDC(abilityScores, profBonus);
    return [
      {
        key: "focus",
        label: "Focus Points",
        total: level,
        recharge: "short-or-long",
        description: `Fuel focus features: Flurry of Blows (2 focus), Patient Defense (1 focus), Step of the Wind (1 focus), and subclass abilities. Focus save DC ${focusDC}. Regain all focus on a short or long rest.`,
      },
    ];
  },
  subclasses: {
    "warrior of the open hand": {
      grantLevel: 3,
      features: WARRIOR_OF_THE_OPEN_HAND_FEATURES,
      // Wholeness of Body (SRD 5.2): uses = Wisdom modifier (min 1), not the
      // 2014 flat 1-use/long-rest shape — needs abilityScores, unlike the
      // level-only 2014 formula.
      resourceFn: (level, abilityScores) => {
        if (level < 6) return [];
        const wisMod = Math.max(1, abilityModifier(abilityScores.wisdom ?? 10));
        return [
          {
            key: "wholenessOfBody",
            label: "Wholeness of Body",
            total: wisMod,
            recharge: "longRest",
            description: `Bonus action: roll your Martial Arts die and regain that many HP plus your Wisdom modifier (minimum 1). ${wisMod} use(s) per long rest.`,
          },
        ];
      },
    },
    "way of shadow": {
      grantLevel: 3,
      features: WAY_OF_SHADOW_FEATURES,
      deriveExtras: (level) => {
        const extras: { shadowArtsAvailable?: boolean; cloakOfShadowsAvailable?: boolean } = {};
        if (level >= 3) extras.shadowArtsAvailable = true;
        if (level >= 11) extras.cloakOfShadowsAvailable = true;
        return extras;
      },
    },
    "way of the four elements": {
      grantLevel: 3,
      features: FOUR_ELEMENTS_FEATURES,
      deriveExtras: (level, abilityScores, profBonus) => ({
        disciplineChoiceCount: fourElementsDisciplineCount(level),
        disciplineSaveDC: focusSaveDC(abilityScores, profBonus),
      }),
    },
  },
};
