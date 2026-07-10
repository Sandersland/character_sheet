import { abilityModifier } from "@/lib/srd/srd.js";

import type { ClassDefinition, DerivedFeature, DerivedResource } from "./types.js";

/** Superiority dice count by Fighter level (Battle Master). */
function battleMasterDiceCount(level: number): number {
  if (level >= 15) return 6;
  if (level >= 7) return 5;
  return 4;
}

/** Superiority die size by Fighter level (Battle Master). */
function battleMasterDieFace(level: number): string {
  if (level >= 18) return "d12";
  if (level >= 10) return "d10";
  return "d8";
}

/**
 * Number of artisan's-tool proficiency choices the Battle Master may make
 * via Student of War. Returns 1 at/above level 3 (when the subclass is
 * granted), 0 below. Modeled as a count (not a boolean) to stay parallel
 * with battleMasterManeuverCount for the level-reconciliation registry.
 */
function studentOfWarToolCount(level: number): number {
  return level >= 3 ? 1 : 0;
}

/** Maneuver choice count by Fighter level (Battle Master). */
function battleMasterManeuverCount(level: number): number {
  if (level >= 15) return 9;
  if (level >= 10) return 7;
  if (level >= 7) return 5;
  return 3;
}

const FIGHTER_FEATURES: DerivedFeature[] = [
  {
    name: "Fighting Style",
    level: 1,
    source: "class",
    description:
      "Choose a fighting style specialty: Archery (+2 ranged attack rolls), Defense (+1 AC in armor), Dueling (+2 melee damage when only wielding one weapon), Great Weapon Fighting (reroll 1s and 2s on damage with two-handed weapons), Protection (impose disadvantage on attacks against adjacent allies), or Two-Weapon Fighting (add ability modifier to off-hand damage).",
  },
  {
    name: "Second Wind",
    level: 1,
    source: "class",
    description:
      "As a bonus action, regain 1d10 + your fighter level HP. Regain use on a short or long rest.",
  },
  {
    name: "Action Surge",
    level: 2,
    source: "class",
    description:
      "Take one additional action on your turn. Regain use(s) on a short or long rest. You have 2 uses starting at level 17.",
  },
  {
    name: "Extra Attack",
    level: 5,
    source: "class",
    description:
      "You can attack twice when taking the Attack action. Three times at level 11; four times at level 20.",
  },
  {
    name: "Indomitable",
    level: 9,
    source: "class",
    description:
      "Reroll a failed saving throw (you must use the new roll). Regain use(s) on a long rest. Two uses at level 13, three at level 17.",
  },
];

const BATTLE_MASTER_FEATURES: DerivedFeature[] = [
  {
    name: "Combat Superiority",
    level: 3,
    source: "subclass",
    description:
      "You learn maneuvers fueled by superiority dice (d8s). You have 4 dice and regain all expended dice on a short or long rest. Maneuvers can only be used once per attack unless otherwise stated.",
  },
  {
    name: "Student of War",
    level: 3,
    source: "subclass",
    description:
      "You gain proficiency with one type of artisan's tools of your choice.",
  },
  {
    name: "Know Your Enemy",
    level: 7,
    source: "subclass",
    description:
      "If you spend at least 1 minute observing or interacting with another creature outside combat, you can compare two of its ability scores, armor class, hit points, hit dice, or levels to your own.",
  },
  {
    name: "Improved Combat Superiority (d10)",
    level: 10,
    source: "subclass",
    description: "Your superiority dice turn into d10s.",
  },
  {
    name: "Relentless",
    level: 15,
    source: "subclass",
    description:
      "When you roll initiative and have no superiority dice remaining, you regain 1 superiority die.",
  },
  {
    name: "Improved Combat Superiority (d12)",
    level: 18,
    source: "subclass",
    description: "Your superiority dice turn into d12s.",
  },
];

const CHAMPION_FEATURES: DerivedFeature[] = [
  {
    name: "Improved Critical",
    level: 3,
    source: "subclass",
    description: "Your weapon attacks score a critical hit on a roll of 19 or 20.",
  },
  {
    name: "Remarkable Athlete",
    level: 7,
    source: "subclass",
    description:
      "Add half your proficiency bonus (rounded up) to Strength, Dexterity, or Constitution checks that don't already use your proficiency bonus. Running long jump distance increases by your Strength modifier in feet.",
  },
  {
    name: "Additional Fighting Style",
    level: 10,
    source: "subclass",
    description: "Choose a second option from the Fighting Style class feature.",
  },
  {
    name: "Superior Critical",
    level: 15,
    source: "subclass",
    description: "Your weapon attacks score a critical hit on a roll of 18, 19, or 20.",
  },
  {
    name: "Survivor",
    level: 18,
    source: "subclass",
    description:
      "At the start of each of your turns, regain HP equal to 5 + your Constitution modifier if you are at or below half your hit point maximum (and not at 0 HP).",
  },
];

const ELDRITCH_KNIGHT_FEATURES: DerivedFeature[] = [
  {
    name: "Eldritch Knight Spellcasting",
    level: 3,
    source: "subclass",
    description:
      "You learn spells from the wizard list (primarily abjuration and evocation), casting with Intelligence. Third-caster progression: spell slots start at level 3. You know cantrips and a limited number of spells.",
  },
  {
    name: "Weapon Bond",
    level: 3,
    source: "subclass",
    description:
      "Perform a 1-hour ritual to bond with up to two weapons. Bonded weapons can't be disarmed and you can summon one to your hand as a bonus action.",
  },
  {
    name: "War Magic",
    level: 7,
    source: "subclass",
    description:
      "When you use your action to cast a cantrip, you can make one weapon attack as a bonus action.",
  },
  {
    name: "Eldritch Strike",
    level: 10,
    source: "subclass",
    description:
      "When you hit a creature with a weapon attack, that creature has disadvantage on the next saving throw it makes against a spell you cast before the end of your next turn.",
  },
  {
    name: "Arcane Charge",
    level: 15,
    source: "subclass",
    description:
      "When you use your Action Surge, you can teleport up to 30 feet to an unoccupied space you can see, before or after the additional action.",
  },
  {
    name: "Improved War Magic",
    level: 18,
    source: "subclass",
    description:
      "When you use your action to cast a spell, you can make one weapon attack as a bonus action.",
  },
];

export const fighter: ClassDefinition = {
  features: FIGHTER_FEATURES,
  resourceFn: (level) => {
    const pools: DerivedResource[] = [
      {
        key: "secondWind",
        label: "Second Wind",
        total: 1,
        recharge: "shortRest",
        description: `Bonus action: regain 1d10 + ${level} HP. Regain use on a short or long rest.`,
      },
    ];
    if (level >= 2) {
      pools.push({
        key: "actionSurge",
        label: "Action Surge",
        total: level >= 17 ? 2 : 1,
        recharge: "shortRest",
        description: "Take one additional action on your turn. Regain use(s) on a short or long rest.",
      });
    }
    if (level >= 9) {
      pools.push({
        key: "indomitable",
        label: "Indomitable",
        total: level >= 17 ? 3 : level >= 13 ? 2 : 1,
        recharge: "longRest",
        description: "Reroll a failed saving throw (must accept the new result). Regain use(s) on a long rest.",
      });
    }
    return pools;
  },
  subclasses: {
    "battle master": {
      grantLevel: 3,
      features: BATTLE_MASTER_FEATURES,
      resourceFn: (level, abilityScores, profBonus) => {
        const count = battleMasterDiceCount(level);
        const die = battleMasterDieFace(level);
        const strMod = abilityModifier(abilityScores.strength ?? 10);
        const dexMod = abilityModifier(abilityScores.dexterity ?? 10);
        const mightMod = Math.max(strMod, dexMod);
        const saveDC = 8 + profBonus + mightMod;
        return [
          {
            key: "superiorityDice",
            label: "Superiority Dice",
            total: count,
            die,
            recharge: "short-or-long",
            description: `Spend to fuel maneuvers. Maneuver save DC ${saveDC}. Regain all on a short or long rest.`,
          },
        ];
      },
      deriveExtras: (level, abilityScores, profBonus) => {
        const strMod = abilityModifier(abilityScores.strength ?? 10);
        const dexMod = abilityModifier(abilityScores.dexterity ?? 10);
        return {
          maneuverChoiceCount: battleMasterManeuverCount(level),
          maneuverSaveDC: 8 + profBonus + Math.max(strMod, dexMod),
          toolProfChoiceCount: studentOfWarToolCount(level),
        };
      },
    },
    champion: { grantLevel: 3, features: CHAMPION_FEATURES },
    "eldritch knight": { grantLevel: 3, features: ELDRITCH_KNIGHT_FEATURES },
  },
};
