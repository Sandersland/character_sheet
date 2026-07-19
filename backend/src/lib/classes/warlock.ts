import type { ClassDefinition, DerivedFeature, DerivedResource } from "./types.js";

const WARLOCK_FEATURES: DerivedFeature[] = [
  {
    name: "Pact Magic",
    level: 1,
    source: "class",
    description:
      "You cast spells using Charisma. Unique short-rest progression: all spell slots are the same (high) level and you regain all slots on a short or long rest. Slots scale: 1st at L1; 2nd at L3; 3rd at L5; 4th at L7; 5th at L9.",
  },
  {
    name: "Eldritch Invocations",
    level: 2,
    source: "class",
    description:
      "Learn 2 eldritch invocations — magical studies that grant you permanent abilities or modify your spells (e.g., Agonizing Blast, Armor of Shadows, Devil's Sight). More invocations at levels 5, 7, 9, 12, 15, 18 (max 8 known).",
  },
  {
    name: "Pact Boon",
    level: 3,
    source: "class",
    description:
      "Your patron grants a boon: Pact of the Chain (familiar with special forms), Pact of the Blade (summon a pact weapon), or Pact of the Tome (Book of Shadows with extra cantrips and rituals).",
  },
  {
    name: "Mystic Arcanum",
    level: 11,
    source: "class",
    description:
      "Choose one 6th-level spell from the warlock list as a Mystic Arcanum. You can cast it once without expending a spell slot per long rest. Gain a 7th-level arcanum at L13, 8th at L15, 9th at L17.",
  },
  {
    name: "Eldritch Master",
    level: 20,
    source: "class",
    description:
      "Spend 1 minute entreating your patron to regain all expended Pact Magic spell slots. Once used, you must finish a long rest before you can do so again.",
  },
];

const THE_FIEND_FEATURES: DerivedFeature[] = [
  {
    name: "Expanded Spell List",
    level: 1,
    source: "subclass",
    description:
      "Add fiend spells to your warlock list: Burning Hands, Command (L1); Blindness/Deafness, Scorching Ray (L3); Fireball, Stinking Cloud (L5); Fire Shield, Wall of Fire (L7); Flame Strike, Hallow (L9).",
  },
  {
    name: "Dark One's Blessing",
    level: 1,
    source: "subclass",
    description:
      "When you reduce a hostile creature to 0 HP, gain temporary HP equal to your Charisma modifier + your warlock level (minimum 1).",
  },
  {
    name: "Dark One's Own Luck",
    level: 6,
    source: "subclass",
    description:
      "Add a d10 to one ability check or saving throw you make. Once used, regain on a short or long rest.",
  },
  {
    name: "Fiendish Resilience",
    level: 10,
    source: "subclass",
    description:
      "After a short or long rest, choose one damage type. You gain resistance to that type until you choose a different one.",
  },
  {
    name: "Hurl Through Hell",
    level: 14,
    source: "subclass",
    description:
      "When you hit a creature with an attack, banish it through the Lower Planes until the start of your next turn. It takes 10d10 psychic damage from the horrors of its brief journey and then returns. Once used, regain on a long rest.",
  },
];

const THE_ARCHFEY_FEATURES: DerivedFeature[] = [
  {
    name: "Expanded Spell List",
    level: 1,
    source: "subclass",
    description:
      "Add archfey spells to your warlock list: Faerie Fire, Sleep (L1); Calm Emotions, Phantasmal Force (L3); Blink, Plant Growth (L5); Dominate Beast, Greater Invisibility (L7); Dominate Person, Seeming (L9).",
  },
  {
    name: "Fey Presence",
    level: 1,
    source: "subclass",
    description:
      "As an action, project a beguiling or dreadful aura in a 10-ft cube. Each creature there must succeed on a Wisdom save (spell save DC) or be charmed or frightened (your choice) until the end of your next turn. Once used, regain on a short or long rest.",
  },
  {
    name: "Misty Escape",
    level: 6,
    source: "subclass",
    description:
      "When you take damage, use your reaction to turn invisible and teleport up to 60 ft to an unoccupied space you can see. Invisibility lasts until the start of your next turn or until you attack or cast a spell. Once used, regain on a short or long rest.",
  },
  {
    name: "Beguiling Defenses",
    level: 10,
    source: "subclass",
    description:
      "You are immune to being charmed. When another creature attempts to charm you, you can use your reaction to have it make a Wisdom saving throw (spell save DC) or be charmed by you for 1 minute or until it takes damage.",
  },
  {
    name: "Dark Delirium",
    level: 14,
    source: "subclass",
    description:
      "As an action, plunge a creature within 60 ft into an illusory dreamscape (Wisdom save DC = spell save DC). While charmed or frightened (your choice) it is incapacitated and ignores its surroundings. It repeats the save at the end of each turn, or when it takes damage. Once used, regain on a short or long rest.",
  },
];

const THE_GREAT_OLD_ONE_FEATURES: DerivedFeature[] = [
  {
    name: "Expanded Spell List",
    level: 1,
    source: "subclass",
    description:
      "Add Great Old One spells to your warlock list: Dissonant Whispers, Tasha's Hideous Laughter (L1); Detect Thoughts, Phantasmal Force (L3); Clairvoyance, Sending (L5); Dominate Beast, Evard's Black Tentacles (L7); Dominate Person, Telekinesis (L9).",
  },
  {
    name: "Awakened Mind",
    level: 1,
    source: "subclass",
    description:
      "Communicate telepathically with any creature you can see within 30 ft. The creature understands you even if it shares no language with you, though it cannot telepathically respond.",
  },
  {
    name: "Entropic Ward",
    level: 6,
    source: "subclass",
    description:
      "When a creature makes an attack roll against you, use your reaction to impose disadvantage. If it misses, you gain advantage on your next attack against it before the end of your next turn. Once used, regain on a short or long rest.",
  },
  {
    name: "Thought Shield",
    level: 10,
    source: "subclass",
    description:
      "Your thoughts can't be read by telepathy or other means unless you allow it. Resistance to psychic damage. When a creature deals psychic damage to you, it takes the same amount.",
  },
  {
    name: "Create Thrall",
    level: 14,
    source: "subclass",
    description:
      "Touch an incapacitated humanoid to charm it indefinitely (no save). While charmed, it obeys your commands and you share telepathic communication with it. Each time the thrall takes damage, it makes a Charisma save to break free (DC = your spell save DC).",
  },
];

export const warlock: ClassDefinition = {
  features: WARLOCK_FEATURES,
  subclasses: {
    "the fiend": {
      grantLevel: 3,
      features: THE_FIEND_FEATURES,
      resourceFn: (level) => {
        if (level < 6) return [];
        const pools: DerivedResource[] = [
          {
            key: "darkOnesOwnLuck",
            label: "Dark One's Own Luck",
            total: 1,
            recharge: "short-or-long",
            description: "Add 1d10 to one ability check or saving throw. Regain use on a short or long rest.",
          },
        ];
        if (level >= 14) {
          pools.push({
            key: "hurlThroughHell",
            label: "Hurl Through Hell",
            total: 1,
            recharge: "longRest",
            description: "When you hit a creature, banish it through the Lower Planes until the start of your next turn (10d10 psychic damage). Regain use on a long rest.",
          });
        }
        return pools;
      },
    },
    "the archfey": {
      grantLevel: 3,
      features: THE_ARCHFEY_FEATURES,
      resourceFn: (level) => {
        const pools: DerivedResource[] = [
          {
            key: "feyPresence",
            label: "Fey Presence",
            total: 1,
            recharge: "short-or-long",
            description: "Action: charm or frighten creatures in a 10-ft cube (Wisdom save). Regain use on a short or long rest.",
          },
        ];
        if (level >= 6) {
          pools.push({
            key: "mistyEscape",
            label: "Misty Escape",
            total: 1,
            recharge: "short-or-long",
            description: "Reaction when damaged: turn invisible and teleport up to 60 ft. Lasts until start of next turn. Regain use on a short or long rest.",
          });
        }
        if (level >= 14) {
          pools.push({
            key: "darkDelirium",
            label: "Dark Delirium",
            total: 1,
            recharge: "short-or-long",
            description: "Action: plunge a creature into an illusory dreamscape (Wisdom save). Charmed or frightened and incapacitated. Regain use on a short or long rest.",
          });
        }
        return pools;
      },
    },
    "the great old one": {
      grantLevel: 3,
      features: THE_GREAT_OLD_ONE_FEATURES,
      resourceFn: (level) => {
        if (level < 6) return [];
        return [
          {
            key: "entropicWard",
            label: "Entropic Ward",
            total: 1,
            recharge: "short-or-long",
            description: "Reaction: impose disadvantage on one attack against you. If it misses, you have advantage on your next attack against it. Regain use on a short or long rest.",
          },
        ];
      },
    },
  },
};
