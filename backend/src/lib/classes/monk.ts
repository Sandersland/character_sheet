import { abilityModifier } from "@/lib/srd/srd.js";

import type { ClassDefinition, DerivedFeature } from "./types.js";

/** Elemental discipline count by Monk level (Way of the Four Elements). */
function fourElementsDisciplineCount(level: number): number {
  if (level >= 17) return 4;
  if (level >= 11) return 3;
  if (level >= 6) return 2;
  return 1;
}

/** Ki save DC (Monk) — used by Stunning Strike, ki features, and elemental disciplines. */
function kiSaveDC(abilityScores: Record<string, number>, profBonus: number): number {
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
      "With unarmed strikes or monk weapons: use Dexterity instead of Strength for attack and damage rolls; deal 1d4 (L1–4), 1d6 (L5–10), 1d8 (L11–16), or 1d10 (L17+) damage; make one bonus unarmed strike after the Attack action.",
  },
  {
    name: "Ki",
    level: 2,
    source: "class",
    description:
      "You have a pool of ki points equal to your monk level. Spend them to fuel: Flurry of Blows (2 ki — two bonus unarmed strikes), Patient Defense (1 ki — Dodge as bonus action), Step of the Wind (1 ki — Disengage or Dash as bonus action, jump distance doubled). Ki save DC = 8 + proficiency + Wisdom modifier. Regain all ki on a short or long rest.",
  },
  {
    name: "Unarmored Movement",
    level: 2,
    source: "class",
    description:
      "Your speed increases by 10 ft while unarmored and unshielded (+15 at L6; +20 at L10; +25 at L14; +30 at L18). At level 9, you can run up vertical surfaces and across liquids on your turn.",
  },
  {
    name: "Deflect Missiles",
    level: 3,
    source: "class",
    description:
      "Use your reaction to deflect or catch a ranged weapon attack. Reduce damage by 1d10 + Dexterity modifier + monk level. If reduced to 0, you catch the missile and can throw it (1 ki) as part of the same reaction.",
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
      "When you hit with a melee weapon attack, spend 1 ki to stun the target. It makes a Constitution save (ki save DC) or is stunned until the end of your next turn — incapacitated, can't move, and attacks against it have advantage.",
  },
  {
    name: "Ki-Empowered Strikes",
    level: 6,
    source: "class",
    description:
      "Your unarmed strikes count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks.",
  },
  {
    name: "Evasion",
    level: 7,
    source: "class",
    description:
      "When subjected to an effect that allows a Dexterity save for half damage, you take no damage on a success and half damage on a failure.",
  },
  {
    name: "Stillness of Mind",
    level: 7,
    source: "class",
    description:
      "As an action, end one effect on yourself that causes you to be charmed or frightened.",
  },
  {
    name: "Purity of Body",
    level: 10,
    source: "class",
    description:
      "Your mastery of ki grants immunity to disease and poison.",
  },
  {
    name: "Tongue of the Sun and Moon",
    level: 13,
    source: "class",
    description:
      "You learn to touch the ki of other minds, allowing you to understand all spoken languages. Any creature that can understand a language can understand what you say.",
  },
  {
    name: "Diamond Soul",
    level: 14,
    source: "class",
    description:
      "You gain proficiency in all saving throws. Additionally, whenever you fail a saving throw, you can spend 1 ki to reroll it and take the second result.",
  },
  {
    name: "Timeless Body",
    level: 15,
    source: "class",
    description:
      "Your ki sustains you so that you suffer none of the frailty of old age, and you can't be aged magically. You still die of old age but are no longer affected by aging.",
  },
  {
    name: "Empty Body",
    level: 18,
    source: "class",
    description:
      "Spend 4 ki to become invisible for 1 minute. During that time, you also have resistance to all damage except force. Spend 8 ki to cast the Astral Projection spell without material components.",
  },
  {
    name: "Perfect Self",
    level: 20,
    source: "class",
    description:
      "When you roll initiative and have no ki points remaining, you regain 4 ki points.",
  },
];

const WAY_OF_THE_OPEN_HAND_FEATURES: DerivedFeature[] = [
  {
    name: "Open Hand Technique",
    level: 3,
    source: "subclass",
    description:
      "When you hit a creature with Flurry of Blows, you can impose one effect: the creature makes a Strength save or falls prone; the creature makes a Dexterity save or is pushed up to 15 ft away; or the creature can't take reactions until the start of your next turn.",
  },
  {
    name: "Wholeness of Body",
    level: 6,
    source: "subclass",
    description:
      "As an action, regain HP equal to three times your monk level. Once used, regain on a long rest.",
  },
  {
    name: "Tranquility",
    level: 11,
    source: "subclass",
    description:
      "At the end of a long rest, you gain the effect of a Sanctuary spell that lasts until your next long rest (Wisdom save DC 8 + proficiency + Wisdom modifier).",
  },
  {
    name: "Quivering Palm",
    level: 17,
    source: "subclass",
    description:
      "When you hit with an unarmed strike, spend 3 ki to set up lethal vibrations in the creature. At any time thereafter, use your action to deal 10d10 necrotic damage (Con save, DC = ki save DC, for half) or end the vibrations harmlessly.",
  },
];

const WAY_OF_SHADOW_FEATURES: DerivedFeature[] = [
  {
    name: "Shadow Arts",
    level: 3,
    source: "subclass",
    description:
      "Spend 2 ki to cast Darkness, Darkvision, Pass without Trace, or Silence — without material components. You also know the Minor Illusion cantrip.",
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
      "You learn magical elemental disciplines fueled by ki. You know the Elemental Attunement discipline plus one elemental discipline of your choice, and learn one additional discipline at levels 6, 11, and 17. Casting an elemental discipline that is a spell costs ki equal to the spell's level; the save DC equals your ki save DC.",
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
    const kiDC = kiSaveDC(abilityScores, profBonus);
    return [
      {
        key: "ki",
        label: "Ki",
        total: level,
        recharge: "short-or-long",
        description: `Fuel ki features: Flurry of Blows (2 ki), Patient Defense (1 ki), Step of the Wind (1 ki), and subclass abilities. Ki save DC ${kiDC}. Regain all ki on a short or long rest.`,
      },
    ];
  },
  subclasses: {
    "way of the open hand": {
      grantLevel: 3,
      features: WAY_OF_THE_OPEN_HAND_FEATURES,
      resourceFn: (level) => {
        if (level < 6) return [];
        return [
          {
            key: "wholenessOfBody",
            label: "Wholeness of Body",
            total: 1,
            recharge: "longRest",
            description: `Action: regain ${level * 3} HP (three times your monk level). Regain use on a long rest.`,
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
        disciplineSaveDC: kiSaveDC(abilityScores, profBonus),
      }),
    },
  },
};
