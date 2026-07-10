import { abilityModifier } from "@/lib/srd/srd.js";

import type { ClassDefinition, DerivedFeature, DerivedResource } from "./types.js";

const PALADIN_FEATURES: DerivedFeature[] = [
  {
    name: "Divine Sense",
    level: 1,
    source: "class",
    description:
      "As an action, sense the presence of celestials, fiends, and undead within 60 ft until the end of your next turn (they aren't hidden from this sense). You can also detect consecrated or desecrated places/objects. Uses = 1 + Charisma modifier per long rest.",
  },
  {
    name: "Lay on Hands",
    level: 1,
    source: "class",
    description:
      "Touch to restore HP from a pool of 5 × your paladin level. Alternatively, spend 5 HP from the pool to cure one disease or neutralize one poison. The pool replenishes on a long rest.",
  },
  {
    name: "Fighting Style",
    level: 2,
    source: "class",
    description:
      "Choose a fighting style specialty: Defense (+1 AC in armor), Dueling (+2 melee damage with one weapon), Great Weapon Fighting (reroll 1s and 2s on damage), or Protection (impose disadvantage on attacks against adjacent allies).",
  },
  {
    name: "Spellcasting",
    level: 2,
    source: "class",
    description:
      "You cast spells using Charisma starting at level 2. Half-caster progression (you gain spell slots more slowly than full casters). You prepare a number of paladin spells equal to your Charisma modifier + half your paladin level (rounded down).",
  },
  {
    name: "Divine Smite",
    level: 2,
    source: "class",
    description:
      "When you hit with a melee weapon attack, expend one spell slot to deal +2d8 radiant damage (+1d8 per slot level above 1st, max +5d8). Undead and fiends take an additional 1d8 radiant damage.",
  },
  {
    name: "Divine Health",
    level: 3,
    source: "class",
    description:
      "The divine magic flowing through you makes you immune to disease.",
  },
  {
    name: "Channel Divinity",
    level: 3,
    source: "class",
    description:
      "You can channel divine energy through your sacred oath to fuel magical effects. You have 1 use, regained on a short or long rest. The specific options depend on your oath (see subclass features).",
  },
  {
    name: "Extra Attack",
    level: 5,
    source: "class",
    description: "You can attack twice whenever you take the Attack action on your turn.",
  },
  {
    name: "Aura of Protection",
    level: 6,
    source: "class",
    description:
      "Friendly creatures within 10 ft add your Charisma modifier (minimum +1) to saving throws while you are conscious. Aura extends to 30 ft at level 18.",
  },
  {
    name: "Aura of Courage",
    level: 10,
    source: "class",
    description:
      "Friendly creatures within 10 ft can't be frightened while you are conscious. Aura extends to 30 ft at level 18.",
  },
  {
    name: "Improved Divine Smite",
    level: 11,
    source: "class",
    description:
      "Whenever you hit with a melee weapon, you deal an extra 1d8 radiant damage in addition to any other Divine Smite dice.",
  },
  {
    name: "Cleansing Touch",
    level: 14,
    source: "class",
    description:
      "As an action, end one spell on yourself or one willing creature within reach. Uses = Charisma modifier per long rest (minimum 1).",
  },
];

const OATH_OF_DEVOTION_FEATURES: DerivedFeature[] = [
  {
    name: "Oath Spells",
    level: 3,
    source: "subclass",
    description:
      "Always-prepared oath spells: Protection from Evil and Good, Sanctuary (L3); Lesser Restoration, Zone of Truth (L5); Beacon of Hope, Dispel Magic (L9); Freedom of Movement, Guardian of Faith (L13); Commune, Flame Strike (L17).",
  },
  {
    name: "Channel Divinity: Sacred Weapon",
    level: 3,
    source: "subclass",
    description:
      "As an action, imbue one weapon with positive energy for 1 minute. It emits bright light (20 ft), dim light (20 ft more), and you add your Charisma modifier to attack rolls. The weapon becomes magical if it isn't already. Uses the Channel Divinity pool.",
  },
  {
    name: "Channel Divinity: Turn the Unholy",
    level: 3,
    source: "subclass",
    description:
      "As an action, present your holy symbol and speak a prayer. Each fiend or undead within 30 ft must make a Wisdom saving throw or be turned for 1 minute. Uses the Channel Divinity pool.",
  },
  {
    name: "Aura of Devotion",
    level: 7,
    source: "subclass",
    description:
      "Friendly creatures within 10 ft can't be charmed while you are conscious (30 ft at level 18).",
  },
  {
    name: "Purity of Spirit",
    level: 15,
    source: "subclass",
    description:
      "You are always under the effects of a Protection from Evil and Good spell.",
  },
  {
    name: "Holy Nimbus",
    level: 20,
    source: "subclass",
    description:
      "As an action, emit an aura of sunlight for 1 minute (60-ft radius, bright light). At the start of each turn, enemies in the aura take 10 radiant damage. You have advantage on saves against spells cast by fiends and undead during this time. Once used, regain on a long rest.",
  },
];

const OATH_OF_THE_ANCIENTS_FEATURES: DerivedFeature[] = [
  {
    name: "Oath Spells",
    level: 3,
    source: "subclass",
    description:
      "Always-prepared oath spells: Ensnaring Strike, Speak with Animals (L3); Moonbeam, Misty Step (L5); Plant Growth, Protection from Energy (L9); Ice Storm, Stoneskin (L13); Commune with Nature, Tree Stride (L17).",
  },
  {
    name: "Channel Divinity: Nature's Wrath",
    level: 3,
    source: "subclass",
    description:
      "As an action, restrain a creature within 10 ft: ethereal vines bind it until it makes a Strength or Dexterity save (DC = paladin spell save DC). Uses the Channel Divinity pool.",
  },
  {
    name: "Channel Divinity: Turn the Faithless",
    level: 3,
    source: "subclass",
    description:
      "As an action, present your holy symbol. Each fey or fiend within 30 ft must make a Wisdom saving throw or be turned for 1 minute. A turned creature that has nowhere to flee cowers. Uses the Channel Divinity pool.",
  },
  {
    name: "Aura of Warding",
    level: 7,
    source: "subclass",
    description:
      "You and friendly creatures within 10 ft have resistance to damage from spells (30 ft at level 18).",
  },
  {
    name: "Undying Sentinel",
    level: 15,
    source: "subclass",
    description:
      "When reduced to 0 HP without dying outright, you drop to 1 HP instead. Once used, regain on a long rest. You also don't suffer the aging effects of spells or magical effects.",
  },
  {
    name: "Elder Champion",
    level: 20,
    source: "subclass",
    description:
      "As an action, take on an aspect of nature for 1 minute: regain 10 HP at the start of each turn; cast spells as a bonus action; enemies within 10 ft have disadvantage on saves against your paladin spells and Channel Divinity. Once used, regain on a long rest.",
  },
];

const OATH_OF_VENGEANCE_FEATURES: DerivedFeature[] = [
  {
    name: "Oath Spells",
    level: 3,
    source: "subclass",
    description:
      "Always-prepared oath spells: Bane, Hunter's Mark (L3); Hold Person, Misty Step (L5); Haste, Protection from Energy (L9); Banishment, Dimension Door (L13); Hold Monster, Scrying (L17).",
  },
  {
    name: "Channel Divinity: Abjure Enemy",
    level: 3,
    source: "subclass",
    description:
      "As an action, choose a creature within 60 ft. It makes a Wisdom save (DC = paladin spell save DC) or becomes frightened and its speed is 0 until the end of your next turn (half speed on a success). Fiends and undead have disadvantage on this save. Uses the Channel Divinity pool.",
  },
  {
    name: "Channel Divinity: Vow of Enmity",
    level: 3,
    source: "subclass",
    description:
      "As a bonus action, say a vow of enmity against a creature within 10 ft. Gain advantage on attack rolls against it for 1 minute or until it drops to 0 HP. Uses the Channel Divinity pool.",
  },
  {
    name: "Relentless Avenger",
    level: 7,
    source: "subclass",
    description:
      "When you hit with an opportunity attack, you can move up to half your speed (without provoking opportunity attacks) as part of the same reaction.",
  },
  {
    name: "Soul of Vengeance",
    level: 15,
    source: "subclass",
    description:
      "When a creature under your Vow of Enmity makes an attack, use your reaction to make a melee weapon attack against it.",
  },
  {
    name: "Avenging Angel",
    level: 20,
    source: "subclass",
    description:
      "As an action, assume an angelic form for 1 hour: fly speed 60 ft; enemies within 30 ft who can see you must make a Wisdom save or be frightened of you for 1 minute. Once used, regain on a long rest.",
  },
];

export const paladin: ClassDefinition = {
  features: PALADIN_FEATURES,
  resourceFn: (level, abilityScores) => {
    const chaMod = abilityModifier(abilityScores.charisma ?? 10);
    const pools: DerivedResource[] = [
      {
        key: "divineSense",
        label: "Divine Sense",
        total: Math.max(1, 1 + chaMod),
        recharge: "longRest",
        description: "Action: sense celestials, fiends, and undead within 60 ft until end of next turn. Regain all uses on a long rest.",
      },
      {
        key: "layOnHands",
        label: "Lay on Hands",
        total: level * 5,
        recharge: "longRest",
        description: `Pool of ${level * 5} healing HP. Touch to restore HP; spend 5 HP to cure a disease or neutralize a poison. Replenishes on a long rest.`,
      },
    ];
    if (level >= 3) {
      pools.push({
        key: "channelDivinity",
        label: "Channel Divinity",
        total: 1,
        recharge: "short-or-long",
        description: "Channel divine energy for oath-specific effects. Regain use on a short or long rest.",
      });
    }
    return pools;
  },
  subclasses: {
    "oath of devotion": { grantLevel: 3, features: OATH_OF_DEVOTION_FEATURES },
    "oath of the ancients": { grantLevel: 3, features: OATH_OF_THE_ANCIENTS_FEATURES },
    "oath of vengeance": { grantLevel: 3, features: OATH_OF_VENGEANCE_FEATURES },
  },
};
