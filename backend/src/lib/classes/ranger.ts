import type { ClassDefinition, DerivedFeature } from "./types.js";

const RANGER_FEATURES: DerivedFeature[] = [
  {
    name: "Favored Enemy",
    level: 1,
    source: "class",
    description:
      "Choose a type of favored enemy (beasts, fey, humanoids of a specific type, etc.). You have advantage on Survival checks to track them and on Intelligence checks to recall information about them. You learn one language spoken by your favored enemy. Additional enemy at L6 and L14.",
  },
  {
    name: "Natural Explorer",
    level: 1,
    source: "class",
    description:
      "Choose a favored terrain type. When traveling in it: ignore difficult terrain, can't be surprised if alert, advantage on Initiative rolls, initiative even if surprised once per turn, move at normal pace while stealthing. Additional terrain at L6 and L10.",
  },
  {
    name: "Fighting Style",
    level: 2,
    source: "class",
    description:
      "Choose: Archery (+2 ranged attack rolls), Defense (+1 AC in armor), Dueling (+2 melee damage with one weapon), or Two-Weapon Fighting (add ability modifier to off-hand damage).",
  },
  {
    name: "Spellcasting",
    level: 2,
    source: "class",
    description:
      "You cast spells using Wisdom. Half-caster progression (first slots at level 2, one level behind full casters). You prepare a number of ranger spells equal to half your ranger level + Wisdom modifier (minimum 1).",
  },
  {
    name: "Primeval Awareness",
    level: 3,
    source: "class",
    description:
      "Expend one spell slot to focus your awareness for 1 minute per slot level. You sense whether certain types of creatures are within 1 mile (or 6 miles in your favored terrain).",
  },
  {
    name: "Extra Attack",
    level: 5,
    source: "class",
    description: "You can attack twice whenever you take the Attack action on your turn.",
  },
  {
    name: "Land's Stride",
    level: 8,
    source: "class",
    description:
      "Moving through nonmagical difficult terrain costs no extra movement. You can pass through nonmagical plants without being slowed or taking damage. Advantage on saves against magically created or manipulated plants.",
  },
  {
    name: "Hide in Plain Sight",
    level: 10,
    source: "class",
    description:
      "Spend 1 minute camouflaging yourself: gain +10 to Dexterity (Stealth) checks while you remain motionless. The bonus is lost when you move, take an action, or take a reaction.",
  },
  {
    name: "Vanish",
    level: 14,
    source: "class",
    description:
      "You can use the Hide action as a bonus action on your turn. Also, you can't be tracked by nonmagical means unless you choose to leave a trail.",
  },
  {
    name: "Feral Senses",
    level: 18,
    source: "class",
    description:
      "When not blinded or deafened, you are aware of invisible creatures within 30 ft even if they are hidden. In combat, no disadvantage on attacks against invisible creatures within 30 ft.",
  },
  {
    name: "Foe Slayer",
    level: 20,
    source: "class",
    description:
      "Once per turn when you hit a favored enemy with a weapon, you may add your Wisdom modifier to the attack roll or the damage roll.",
  },
];

const HUNTER_FEATURES: DerivedFeature[] = [
  {
    name: "Hunter's Prey",
    level: 3,
    source: "subclass",
    description:
      "Choose one: Colossus Slayer (once per turn, +1d8 damage to a wounded creature); Giant Killer (reaction attack when a Large+ creature misses you); or Horde Breaker (once per turn, attack a second creature adjacent to the first).",
  },
  {
    name: "Defensive Tactics",
    level: 7,
    source: "subclass",
    description:
      "Choose one: Escape the Horde (opportunity attacks against you have disadvantage); Multiattack Defense (+4 AC against other attacks after being hit by one); or Steel Will (advantage on saves against being frightened).",
  },
  {
    name: "Multiattack",
    level: 11,
    source: "subclass",
    description:
      "Choose one: Volley (action: ranged attack against every creature in a 10-ft radius within range); or Whirlwind Attack (action: melee attack against every creature within reach).",
  },
  {
    name: "Superior Hunter's Defense",
    level: 15,
    source: "subclass",
    description:
      "Choose one: Evasion (no damage on successful Dex save, half on failure); Stand Against the Tide (redirect a missed melee attack to another creature within range); or Uncanny Dodge (halve damage from one attack per reaction).",
  },
];

const BEAST_MASTER_FEATURES: DerivedFeature[] = [
  {
    name: "Ranger's Companion",
    level: 3,
    source: "subclass",
    description:
      "Bond with a beast companion of CR 1/4 or lower. It acts on your turn (using your action to command it after the first round). It uses your proficiency bonus and gains bonus HP equal to four times your ranger level.",
  },
  {
    name: "Exceptional Training",
    level: 7,
    source: "subclass",
    description:
      "Use a bonus action to command your companion to Dash, Disengage, Dodge, or Help. Its attacks count as magical.",
  },
  {
    name: "Bestial Fury",
    level: 11,
    source: "subclass",
    description:
      "Your companion can make two attacks when you command it to attack.",
  },
  {
    name: "Share Spells",
    level: 15,
    source: "subclass",
    description:
      "When you cast a spell targeting yourself, you can also affect your companion if it is within 30 ft.",
  },
];

export const ranger: ClassDefinition = {
  features: RANGER_FEATURES,
  subclasses: {
    hunter: { grantLevel: 3, features: HUNTER_FEATURES },
    "beast master": { grantLevel: 3, features: BEAST_MASTER_FEATURES },
  },
};
