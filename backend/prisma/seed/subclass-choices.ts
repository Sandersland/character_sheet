// --- Generic subclass "choose N" option catalog (#899) ----------------------
// Options for the data-driven subclass choice mechanism (SubclassChoice in
// classes/types.ts), seeded as GrantedAbility rows keyed by `source` = the
// choice's catalogSource. These are plain descriptive features — no cost/effect
// columns; the only per-character state is which option was picked
// (Character.resources.choicesKnown[choiceKey]).
//
// A new "choose N" feature (Barbarian totems, Sorcerer Metamagic, Warlock
// Invocations) is added by declaring a SubclassChoice on its subclass and adding
// its options here — no new reconciler or state key.

export interface SubclassChoiceOptionSeed {
  name: string;
  /** Matches the SubclassChoice.catalogSource that groups these options. */
  source: string;
  description: string;
  /** Minimum character level to pick this option (the choice's grant level). */
  minLevel: number;
}

export const SUBCLASS_CHOICE_OPTIONS: SubclassChoiceOptionSeed[] = [
  // Ranger — Hunter: Hunter's Prey (L3, choose one).
  {
    name: "Colossus Slayer",
    source: "huntersPrey",
    minLevel: 3,
    description:
      "Your tenacity can wear down the most potent foes. When you hit a creature with a weapon attack, it takes an extra 1d8 damage if it's below its hit point maximum. You can deal this extra damage only once per turn.",
  },
  {
    name: "Giant Killer",
    source: "huntersPrey",
    minLevel: 3,
    description:
      "When a Large or larger creature within 5 feet of you hits or misses you with an attack, you can use your reaction to attack that creature immediately after its attack, provided you can see it.",
  },
  {
    name: "Horde Breaker",
    source: "huntersPrey",
    minLevel: 3,
    description:
      "Once on each of your turns when you make a weapon attack, you can make another attack with the same weapon against a different creature that is within 5 feet of the original target and within range of your weapon.",
  },

  // Ranger — Hunter: Defensive Tactics (L7, choose one).
  {
    name: "Escape the Horde",
    source: "defensiveTactics",
    minLevel: 7,
    description: "Opportunity attacks against you are made with disadvantage.",
  },
  {
    name: "Multiattack Defense",
    source: "defensiveTactics",
    minLevel: 7,
    description:
      "When a creature hits you with an attack, you gain a +4 bonus to AC against all subsequent attacks made by that creature for the rest of the turn.",
  },
  {
    name: "Steel Will",
    source: "defensiveTactics",
    minLevel: 7,
    description: "You have advantage on saving throws against being frightened.",
  },

  // Ranger — Hunter: Multiattack (L11, choose one).
  {
    name: "Volley",
    source: "hunterMultiattack",
    minLevel: 11,
    description:
      "You can use your action to make a ranged attack against any number of creatures within 10 feet of a point you can see within your weapon's range. You must have ammunition for each target, and you make a separate attack roll for each.",
  },
  {
    name: "Whirlwind Attack",
    source: "hunterMultiattack",
    minLevel: 11,
    description:
      "You can use your action to make a melee attack against any number of creatures within 5 feet of you, with a separate attack roll for each target.",
  },

  // Ranger — Hunter: Superior Hunter's Defense (L15, choose one).
  {
    name: "Evasion",
    source: "superiorHuntersDefense",
    minLevel: 15,
    description:
      "When you're subjected to an effect that allows a Dexterity saving throw to take only half damage, you instead take no damage on a success and only half on a failure.",
  },
  {
    name: "Stand Against the Tide",
    source: "superiorHuntersDefense",
    minLevel: 15,
    description:
      "When a hostile creature misses you with a melee attack, you can use your reaction to force that creature to repeat the same attack against another creature (other than itself) of your choice.",
  },
  {
    name: "Uncanny Dodge",
    source: "superiorHuntersDefense",
    minLevel: 15,
    description:
      "When an attacker you can see hits you with an attack, you can use your reaction to halve the attack's damage against you.",
  },
];
