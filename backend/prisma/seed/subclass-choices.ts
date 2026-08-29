// Options for the data-driven subclass choice mechanism (SubclassChoice in
// classes/types.ts), seeded as GrantedAbility rows keyed by `source` = the
// choice's catalogSource. Plain descriptive features — no cost/effect
// columns; the only per-character state is which option was picked
// (Character.resources.choicesKnown[choiceKey]). A new "choose N" feature is
// added by declaring a SubclassChoice on its subclass and adding its options
// here — no new reconciler or state key.

import type { SeedEdition } from "./edition.js";

export interface SubclassChoiceOptionSeed {
  name: string;
  /** Matches the SubclassChoice.catalogSource that groups these options. */
  source: string;
  description: string;
  /** Minimum character level to pick this option (the choice's grant level). */
  minLevel: number;
  // Omitted = shared (NULL column, valid in both editions, #1306); only a
  // mechanically diverging row forks, which #1415 made expressible.
  edition?: SeedEdition;
}

// SRD 5.1 pp. 37-38 (EDITION_2014/shared rows below); SRD 5.2 p. 61 (EDITION_2024 forks).
export const SUBCLASS_CHOICE_OPTIONS: SubclassChoiceOptionSeed[] = [
  {
    name: "Colossus Slayer",
    source: "huntersPrey",
    minLevel: 3,
    edition: "EDITION_2014",
    description:
      "Your tenacity can wear down the most potent foes. When you hit a creature with a weapon attack, it takes an extra 1d8 damage if it's below its hit point maximum. You can deal this extra damage only once per turn.",
  },
  {
    name: "Colossus Slayer",
    source: "huntersPrey",
    minLevel: 3,
    edition: "EDITION_2024",
    description:
      "Your tenacity can wear down even the most resilient foes. When you hit a creature with a weapon, the weapon deals an extra 1d8 damage to the target if it's missing any of its Hit Points. You can deal this extra damage only once per turn.",
  },
  {
    name: "Giant Killer",
    source: "huntersPrey",
    minLevel: 3,
    edition: "EDITION_2014",
    description:
      "When a Large or larger creature within 5 feet of you hits or misses you with an attack, you can use your reaction to attack that creature immediately after its attack, provided you can see it.",
  },
  {
    name: "Horde Breaker",
    source: "huntersPrey",
    minLevel: 3,
    edition: "EDITION_2014",
    description:
      "Once on each of your turns when you make a weapon attack, you can make another attack with the same weapon against a different creature that is within 5 feet of the original target and within range of your weapon.",
  },
  {
    name: "Horde Breaker",
    source: "huntersPrey",
    minLevel: 3,
    edition: "EDITION_2024",
    description:
      "Once on each of your turns when you make an attack with a weapon, you can make another attack with the same weapon against a different creature that is within 5 feet of the original target, that is within the weapon's range, and that you haven't attacked this turn.",
  },

  {
    name: "Escape the Horde",
    source: "defensiveTactics",
    minLevel: 7,
    edition: "EDITION_2014",
    description: "Opportunity attacks against you are made with disadvantage.",
  },
  {
    name: "Escape the Horde",
    source: "defensiveTactics",
    minLevel: 7,
    edition: "EDITION_2024",
    description: "Opportunity Attacks have Disadvantage against you.",
  },
  {
    name: "Multiattack Defense",
    source: "defensiveTactics",
    minLevel: 7,
    edition: "EDITION_2014",
    description:
      "When a creature hits you with an attack, you gain a +4 bonus to AC against all subsequent attacks made by that creature for the rest of the turn.",
  },
  {
    name: "Multiattack Defense",
    source: "defensiveTactics",
    minLevel: 7,
    edition: "EDITION_2024",
    description: "When a creature hits you with an attack roll, that creature has Disadvantage on all other attack rolls against you this turn.",
  },
  {
    name: "Steel Will",
    source: "defensiveTactics",
    minLevel: 7,
    edition: "EDITION_2014",
    description: "You have advantage on saving throws against being frightened.",
  },

  // 2014-only: 2024's Superior Hunter's Prey replaces this slot with a fixed feature.
  {
    name: "Volley",
    source: "hunterMultiattack",
    minLevel: 11,
    edition: "EDITION_2014",
    description:
      "You can use your action to make a ranged attack against any number of creatures within 10 feet of a point you can see within your weapon's range. You must have ammunition for each target, and you make a separate attack roll for each.",
  },
  {
    name: "Whirlwind Attack",
    source: "hunterMultiattack",
    minLevel: 11,
    edition: "EDITION_2014",
    description:
      "You can use your action to make a melee attack against any number of creatures within 5 feet of you, with a separate attack roll for each target.",
  },

  // 2014-only: 2024's Superior Hunter's Defense is a single fixed Reaction, not a choice.
  {
    name: "Evasion",
    source: "superiorHuntersDefense",
    minLevel: 15,
    edition: "EDITION_2014",
    description:
      "When you're subjected to an effect that allows a Dexterity saving throw to take only half damage, you instead take no damage on a success and only half on a failure.",
  },
  {
    name: "Stand Against the Tide",
    source: "superiorHuntersDefense",
    minLevel: 15,
    edition: "EDITION_2014",
    description:
      "When a hostile creature misses you with a melee attack, you can use your reaction to force that creature to repeat the same attack against another creature (other than itself) of your choice.",
  },
  {
    name: "Uncanny Dodge",
    source: "superiorHuntersDefense",
    minLevel: 15,
    edition: "EDITION_2014",
    description:
      "When an attacker you can see hits you with an attack, you can use your reaction to halve the attack's damage against you.",
  },
];
