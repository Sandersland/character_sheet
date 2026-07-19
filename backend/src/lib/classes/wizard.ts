import type { ClassDefinition, DerivedFeature } from "./types.js";

const WIZARD_FEATURES: DerivedFeature[] = [
  {
    name: "Spellcasting",
    level: 1,
    source: "class",
    description:
      "You cast spells using Intelligence. Full-caster progression. You copy spells into your spellbook and prepare a number equal to your Intelligence modifier + your wizard level (minimum 1) after each long rest.",
  },
  {
    name: "Arcane Recovery",
    level: 1,
    source: "class",
    description:
      "Once per day when finishing a short rest, choose expended spell slots to recover. Total levels of slots recovered can be up to half your wizard level (rounded up, max 5th-level slots).",
  },
  {
    name: "Spell Mastery",
    level: 18,
    source: "class",
    description:
      "Choose one 1st-level and one 2nd-level wizard spell in your spellbook. You can cast each of those spells at their lowest level without expending a spell slot. Changing choices requires 8 hours of study.",
  },
  {
    name: "Signature Spells",
    level: 20,
    source: "class",
    description:
      "Choose two 3rd-level wizard spells in your spellbook as signature spells. They are always prepared and don't count against your prepared spells count. You can cast each once without expending a slot; regain both uses after a short or long rest.",
  },
];

const SCHOOL_OF_EVOCATION_FEATURES: DerivedFeature[] = [
  {
    name: "Evocation Savant",
    level: 2,
    source: "subclass",
    description:
      "The gold and time you must spend to copy an evocation spell into your spellbook is halved.",
  },
  {
    name: "Sculpt Spells",
    level: 2,
    source: "subclass",
    description:
      "When you cast an evocation spell, choose a number of creatures equal to 1 + the spell's level. Those creatures automatically succeed on their saving throw and take no damage (even if they'd normally take half on a success).",
  },
  {
    name: "Potent Cantrip",
    level: 6,
    source: "subclass",
    description:
      "When a creature succeeds on a saving throw against your cantrip, it takes half the cantrip's damage rather than none.",
  },
  {
    name: "Empowered Evocation",
    level: 10,
    source: "subclass",
    description:
      "Add your Intelligence modifier to one damage roll of any evocation spell you cast.",
  },
  {
    name: "Overchannel",
    level: 14,
    source: "subclass",
    description:
      "When you cast a wizard spell of 1st–5th level that deals damage, you can deal maximum damage with it. The first time per long rest you do so, you suffer no ill effect. Each use thereafter costs 2d12 necrotic per spell level (before the rest).",
  },
];

const SCHOOL_OF_ABJURATION_FEATURES: DerivedFeature[] = [
  {
    name: "Abjuration Savant",
    level: 2,
    source: "subclass",
    description:
      "The gold and time you must spend to copy an abjuration spell into your spellbook is halved.",
  },
  {
    name: "Arcane Ward",
    level: 2,
    source: "subclass",
    description:
      "When you cast an abjuration spell of 1st level or higher, a magical ward forms with HP equal to twice your wizard level + your Intelligence modifier. The ward absorbs damage before you do, and is recharged (2× the spell's level) each time you cast an abjuration spell.",
  },
  {
    name: "Projected Ward",
    level: 6,
    source: "subclass",
    description:
      "When a creature within 30 ft takes damage, use your reaction to have your Arcane Ward absorb that damage instead.",
  },
  {
    name: "Improved Abjuration",
    level: 10,
    source: "subclass",
    description:
      "When you cast an abjuration spell that requires an ability check, you add your proficiency bonus to that check.",
  },
  {
    name: "Spell Resistance",
    level: 14,
    source: "subclass",
    description:
      "You have advantage on saving throws against spells, and resistance to spell damage.",
  },
];

const SCHOOL_OF_ILLUSION_FEATURES: DerivedFeature[] = [
  {
    name: "Illusion Savant",
    level: 2,
    source: "subclass",
    description:
      "The gold and time you must spend to copy an illusion spell into your spellbook is halved.",
  },
  {
    name: "Improved Minor Illusion",
    level: 2,
    source: "subclass",
    description:
      "You know the Minor Illusion cantrip (or a different wizard cantrip if you already know it). When you cast it, you can create both a sound and an image with a single casting.",
  },
  {
    name: "Malleable Illusions",
    level: 6,
    source: "subclass",
    description:
      "When you cast an illusion spell with a duration of 1 minute or longer, you can use your action to change the nature of that illusion (within its original parameters) while you can see it.",
  },
  {
    name: "Illusory Self",
    level: 10,
    source: "subclass",
    description:
      "When a creature makes an attack roll against you, use your reaction to interpose an illusory duplicate — the attack automatically misses. Once used, you regain this ability on a short or long rest.",
  },
  {
    name: "Illusory Reality",
    level: 14,
    source: "subclass",
    description:
      "When you cast an illusion spell of 1st level or higher, you can make one inanimate, nonmagical object part of the illusion real for 1 minute. The object can't deal damage or cause harm.",
  },
];

export const wizard: ClassDefinition = {
  features: WIZARD_FEATURES,
  // Arcane Recovery's once-per-day use, tracked as a longRest-recharge pool so a
  // long rest refreshes it (#904). The slot-level cap is computed at op time.
  resourceFn: () => [
    {
      key: "arcaneRecovery",
      label: "Arcane Recovery",
      total: 1,
      recharge: "longRest",
      description:
        "Once per day when finishing a short rest, recover expended spell slots totalling up to half your wizard level (rounded up), none above 5th level. Regained on a long rest.",
    },
  ],
  subclasses: {
    "school of evocation": { grantLevel: 3, features: SCHOOL_OF_EVOCATION_FEATURES },
    "school of abjuration": { grantLevel: 3, features: SCHOOL_OF_ABJURATION_FEATURES },
    "school of illusion": {
      grantLevel: 3,
      features: SCHOOL_OF_ILLUSION_FEATURES,
      resourceFn: (level) => {
        if (level < 10) return [];
        return [
          {
            key: "illusorySelf",
            label: "Illusory Self",
            total: 1,
            recharge: "short-or-long",
            description: "Reaction: an illusory duplicate causes an attack against you to automatically miss. Regain use on a short or long rest.",
          },
        ];
      },
    },
  },
};
