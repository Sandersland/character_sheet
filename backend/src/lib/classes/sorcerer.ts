import type { ClassDefinition, DerivedFeature } from "./types.js";

const SORCERER_FEATURES: DerivedFeature[] = [
  {
    name: "Spellcasting",
    level: 1,
    source: "class",
    description:
      "You cast spells using Charisma. Full-caster progression. You know a limited number of sorcerer spells (not prepared — always available).",
  },
  {
    name: "Sorcerous Origin",
    level: 1,
    source: "class",
    description:
      "Your innate magic comes from a specific origin (subclass). Your origin grants you features at levels 1, 6, 14, and 18.",
  },
  {
    name: "Font of Magic",
    level: 2,
    source: "class",
    description:
      "You have a pool of Sorcery Points equal to your sorcerer level. Spend them to create spell slots or fuel Metamagic options. Converting: 1 SP = 1st-level slot; 2 SP = 2nd; 3 SP = 3rd; 4 SP = 4th; 5 SP = 5th. You can also convert spell slots to SP (slot level = SP gained). Regain all SP on a long rest.",
  },
  {
    name: "Metamagic",
    level: 3,
    source: "class",
    description:
      "Choose 2 Metamagic options (3 at L10, 4 at L17) to twist your spells: Careful (protect allies in AoE), Distant (double range), Empowered (reroll damage dice), Extended (double duration), Heightened (impose disadvantage on target's first save), Quickened (cast as bonus action), Subtle (no verbal/somatic), or Twinned (target two creatures).",
  },
  {
    name: "Sorcerous Restoration",
    level: 20,
    source: "class",
    description:
      "You regain 4 expended Sorcery Points whenever you finish a short rest.",
  },
];

const DRACONIC_BLOODLINE_FEATURES: DerivedFeature[] = [
  {
    name: "Dragon Ancestor",
    level: 1,
    source: "subclass",
    description:
      "Choose a dragon type (black, blue, brass, bronze, copper, gold, green, red, silver, or white). You gain the ability to speak, read, and write Draconic, and have advantage on Charisma checks when interacting with dragons of that type.",
  },
  {
    name: "Draconic Resilience",
    level: 1,
    source: "subclass",
    description:
      "Your HP maximum increases by 1 per sorcerer level. While not wearing armor, your AC equals 13 + your Dexterity modifier.",
  },
  {
    name: "Elemental Affinity",
    level: 6,
    source: "subclass",
    description:
      "When you cast a spell that deals the damage type associated with your dragon ancestor, add your Charisma modifier to one damage roll. Also spend 1 Sorcery Point to gain resistance to that damage type for 1 hour.",
  },
  {
    name: "Dragon Wings",
    level: 14,
    source: "subclass",
    description:
      "Sprout draconic wings as a bonus action, gaining a flying speed equal to your current speed. The wings last until you dismiss them (no action required).",
  },
  {
    name: "Draconic Presence",
    level: 18,
    source: "subclass",
    description:
      "As an action, spend 5 Sorcery Points to channel draconic majesty for 1 minute (concentration). Each hostile creature within 60 ft that can see you must succeed on a Wisdom save (spell save DC) or be charmed (awed) or frightened (your choice) for the duration.",
  },
];

const WILD_MAGIC_FEATURES: DerivedFeature[] = [
  {
    name: "Wild Magic Surge",
    level: 1,
    source: "subclass",
    description:
      "After casting a sorcerer spell of 1st level or higher, the DM may ask you to roll a d20. On a 1, roll a d100 and consult the Wild Magic Surge table for a random magical effect.",
  },
  {
    name: "Tides of Chaos",
    level: 1,
    source: "subclass",
    description:
      "Gain advantage on one attack roll, ability check, or saving throw. Once used, the DM can force a Wild Magic Surge before you can use this feature again. Alternatively, regain use after a long rest.",
  },
  {
    name: "Bend Luck",
    level: 6,
    source: "subclass",
    description:
      "Spend 2 Sorcery Points as a reaction to add or subtract 1d4 from an attack roll, ability check, or saving throw made by a creature you can see.",
  },
  {
    name: "Controlled Chaos",
    level: 14,
    source: "subclass",
    description:
      "When rolling on the Wild Magic Surge table, roll twice and use either result.",
  },
  {
    name: "Spell Bombardment",
    level: 18,
    source: "subclass",
    description:
      "Once per turn when you roll damage for a spell and any die shows the highest possible result, choose one die, roll it again, and add the result to the damage.",
  },
];

export const sorcerer: ClassDefinition = {
  features: SORCERER_FEATURES,
  resourceFn: (level) => {
    if (level < 2) return [];
    return [
      {
        key: "sorceryPoints",
        label: "Sorcery Points",
        total: level,
        recharge: "longRest",
        description: "Convert to spell slots or fuel Metamagic options (Font of Magic). Regain all points on a long rest.",
      },
    ];
  },
  subclasses: {
    "draconic bloodline": { grantLevel: 1, features: DRACONIC_BLOODLINE_FEATURES },
    "wild magic": {
      grantLevel: 1,
      features: WILD_MAGIC_FEATURES,
      resourceFn: () => [
        {
          key: "tidesOfChaos",
          label: "Tides of Chaos",
          total: 1,
          recharge: "longRest",
          description: "Gain advantage on one attack roll, ability check, or saving throw. Regain use on a long rest (DM may trigger a Wild Magic Surge to restore it early).",
        },
      ],
    },
  },
};
