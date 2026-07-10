// Class features + trackable resources for all 12 base classes and their SRD
// subclasses. Extracted from srd/srd.ts to keep that file at its intended scope
// (small rules tables + core derivation helpers).
//
// `deriveResources` is the analog to `deriveSpellcasting` for non-slot
// resources: superiority dice, ki points, rages, etc. Like deriveSpellcasting
// it is pure (no DB) and called inside serializeCharacter. Only `used` counts
// and known lists persist; totals/die/recharge are derived here every read.
//
// Architecture: a base-class layer (CLASS_RESOURCE_FN / CLASS_FEATURE_LIST)
// merged with a subclass layer (SUBCLASS_RESOURCE_FN / SUBCLASS_FEATURE_LIST).
// The subclass layer is gated by SUBCLASS_GRANT_LEVEL. Base-class pools win on
// key collision so subclasses that share a base pool (e.g. Circle of the Moon
// sharing wildShape; oaths sharing channelDivinity) only contribute features.
//
// To add a subclass:
//   1. Add a feature list constant (XYZ_FEATURES).
//   2. Add a resource function to SUBCLASS_RESOURCE_FN (if any).
//   3. Add the feature list to SUBCLASS_FEATURE_LIST.
//   4. Add an entry to SUBCLASS_GRANT_LEVEL if the subclass is granted before L3.

import { levelForExperience, proficiencyBonusForLevel } from "../experience.js";
import { abilityModifier } from "@/lib/srd/srd.js";

export type RechargeOn = "shortRest" | "longRest" | "short-or-long" | "none";

export interface DerivedResource {
  key: string;          // stable machine key, e.g. "superiorityDice"
  label: string;        // display label, e.g. "Superiority Dice"
  total: number;        // maximum count at this level
  die?: string;         // die size string, e.g. "d8" — absent for simple counters
  recharge: RechargeOn; // when the pool fully recharges
  description?: string;
}

export interface DerivedFeature {
  name: string;
  level: number;        // character level at which this feature is gained
  description: string;
  source: "class" | "subclass";
}

export interface DerivedClassInfo {
  resources: DerivedResource[];
  features: DerivedFeature[];
  /** Battle Master only: number of maneuvers the character may know at this level. */
  maneuverChoiceCount?: number;
  /** Battle Master only: save DC for maneuver effects (8 + prof + Str/Dex mod). */
  maneuverSaveDC?: number;
  /**
   * Number of artisan's-tool proficiency choices available from a subclass
   * feature (currently: Student of War = 1 at Battle Master level 3+).
   * Undefined when no subclass feature grants a tool choice.
   */
  toolProfChoiceCount?: number;
  /** Way of the Four Elements only: number of elemental disciplines known at this level. */
  disciplineChoiceCount?: number;
  /** Way of the Four Elements only: ki save DC for discipline effects (8 + prof + Wis mod). */
  disciplineSaveDC?: number;
  /** Way of Shadow only: whether the L3+ Shadow Arts ki-cast spells are available. */
  shadowArtsAvailable?: boolean;
  /** Way of Shadow only: whether the L11+ Cloak of Shadows self-invisible toggle is available. */
  cloakOfShadowsAvailable?: boolean;
}

// Resolve a class-die reference (e.g. "superiorityDice") to its die-face count
// from derived info; null when the pool is absent or carries no die.
export function resolveClassDie(source: string, info: DerivedClassInfo): number | null {
  const die = info.resources.find((r) => r.key === source)?.die;
  if (!die) return null;
  const faces = Number(die.replace(/^d/i, ""));
  return Number.isFinite(faces) && faces > 0 ? faces : null;
}

// ── Battle Master rules data ──────────────────────────────────────────────────

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

// ── Base class feature lists ──────────────────────────────────────────────────
// CLASS_FEATURE_LIST[classKey] = features earned by playing the base class
// (source: "class"). Only features whose level <= characterLevel are surfaced.

const BARBARIAN_FEATURES: DerivedFeature[] = [
  {
    name: "Rage",
    level: 1,
    source: "class",
    description:
      "As a bonus action, enter a rage lasting up to 1 minute. You gain advantage on Strength checks and saves, a bonus to melee damage (+2 at L1; +3 at L9; +4 at L16), and resistance to bludgeoning, piercing, and slashing damage. You can't cast or concentrate on spells while raging.",
  },
  {
    name: "Unarmored Defense",
    level: 1,
    source: "class",
    description:
      "While not wearing armor, your AC equals 10 + your Dexterity modifier + your Constitution modifier. You may use a shield.",
  },
  {
    name: "Reckless Attack",
    level: 2,
    source: "class",
    description:
      "When making your first attack on your turn, you may attack recklessly: you have advantage on melee weapon attack rolls using Strength this turn, but attack rolls against you also have advantage until your next turn.",
  },
  {
    name: "Danger Sense",
    level: 2,
    source: "class",
    description:
      "You have advantage on Dexterity saving throws against effects that you can see, such as traps and spells. Doesn't apply when blinded, deafened, or incapacitated.",
  },
  {
    name: "Extra Attack",
    level: 5,
    source: "class",
    description: "You can attack twice whenever you take the Attack action on your turn.",
  },
  {
    name: "Fast Movement",
    level: 5,
    source: "class",
    description: "Your speed increases by 10 feet while you aren't wearing heavy armor.",
  },
  {
    name: "Feral Instinct",
    level: 7,
    source: "class",
    description:
      "You have advantage on initiative rolls. If surprised at the start of combat, you can still act normally on your first turn if you enter your rage before doing anything else.",
  },
  {
    name: "Brutal Critical",
    level: 9,
    source: "class",
    description:
      "You can roll one additional weapon damage die on a critical hit with a melee attack. Two extra dice at level 13, three at level 17.",
  },
  {
    name: "Relentless Rage",
    level: 11,
    source: "class",
    description:
      "When reduced to 0 HP while raging without dying outright, make a DC 10 Con save (DC +5 each use; resets on a short or long rest) to drop to 1 HP instead.",
  },
  {
    name: "Persistent Rage",
    level: 15,
    source: "class",
    description: "Your rage ends early only if you fall unconscious or choose to end it.",
  },
  {
    name: "Indomitable Might",
    level: 18,
    source: "class",
    description:
      "If your total for a Strength check is less than your Strength score, you can use that score in place of the total.",
  },
  {
    name: "Primal Champion",
    level: 20,
    source: "class",
    description:
      "Your Strength and Constitution scores each increase by 4, and their maximums become 24.",
  },
];

const BARD_FEATURES: DerivedFeature[] = [
  {
    name: "Spellcasting",
    level: 1,
    source: "class",
    description:
      "You cast spells using Charisma. Full-caster progression (same slot table as Cleric/Wizard). You know a set number of spells from the bard list.",
  },
  {
    name: "Bardic Inspiration",
    level: 1,
    source: "class",
    description:
      "As a bonus action, give one creature within 60 ft a Bardic Inspiration die (d6, becoming d8 at L5, d10 at L10, d12 at L15). They add it to one ability check, attack roll, or saving throw within 10 minutes.",
  },
  {
    name: "Jack of All Trades",
    level: 2,
    source: "class",
    description:
      "Add half your proficiency bonus (rounded down) to any ability check that doesn't already use your proficiency bonus.",
  },
  {
    name: "Song of Rest",
    level: 2,
    source: "class",
    description:
      "If you or any friendly creatures spend hit dice during a short rest and you perform, they regain extra HP: 1d6 (L2), d8 (L9), d10 (L13), d12 (L17).",
  },
  {
    name: "Expertise",
    level: 3,
    source: "class",
    description:
      "Choose two of your skill proficiencies (or one skill + Thieves' Tools). Your proficiency bonus is doubled for those skills. Two more skills at level 10.",
  },
  {
    name: "Font of Inspiration",
    level: 5,
    source: "class",
    description:
      "You regain all of your expended Bardic Inspiration uses on a short or long rest (previously only on a long rest).",
  },
  {
    name: "Countercharm",
    level: 6,
    source: "class",
    description:
      "As an action, start a performance that lasts until the end of your next turn. During that time, friendly creatures within 30 ft have advantage on saves against being frightened or charmed.",
  },
  {
    name: "Magical Secrets",
    level: 10,
    source: "class",
    description:
      "Choose two spells from any class (including this one). They count as bard spells for you. Two more at level 14, two more at level 18.",
  },
  {
    name: "Superior Inspiration",
    level: 20,
    source: "class",
    description:
      "When you roll initiative and have no uses of Bardic Inspiration remaining, you regain one use.",
  },
];

const CLERIC_FEATURES: DerivedFeature[] = [
  {
    name: "Spellcasting",
    level: 1,
    source: "class",
    description:
      "You cast spells using Wisdom. Full-caster progression. You prepare a number of cleric spells equal to your Wisdom modifier + your cleric level (minimum 1).",
  },
  {
    name: "Channel Divinity: Turn Undead",
    level: 2,
    source: "class",
    description:
      "As an action, each undead within 30 ft that can see or hear you must make a Wisdom save (DC 8 + proficiency + Wisdom modifier) or be turned for 1 minute. Turned undead flee you.",
  },
  {
    name: "Destroy Undead",
    level: 5,
    source: "class",
    description:
      "When you turn an undead, any with CR 1/2 or lower are instantly destroyed (CR 1 at L8; CR 2 at L11; CR 3 at L14; CR 4 at L17).",
  },
  {
    name: "Divine Intervention",
    level: 10,
    source: "class",
    description:
      "Call on your deity for aid. Roll percentile dice — on a result ≤ your cleric level, your deity intervenes. On a success, you can't use this feature again for 7 days. At level 20 it automatically succeeds.",
  },
  {
    name: "Divine Intervention Improvement",
    level: 20,
    source: "class",
    description: "Your Divine Intervention call automatically succeeds (no roll required).",
  },
];

const DRUID_FEATURES: DerivedFeature[] = [
  {
    name: "Druidic",
    level: 1,
    source: "class",
    description:
      "You know Druidic, the secret language of druids. You can speak it and leave hidden messages in natural surroundings.",
  },
  {
    name: "Spellcasting",
    level: 1,
    source: "class",
    description:
      "You cast spells using Wisdom. Full-caster progression. You prepare a number of druid spells equal to your Wisdom modifier + your druid level (minimum 1).",
  },
  {
    name: "Wild Shape",
    level: 2,
    source: "class",
    description:
      "As an action, transform into a beast you have seen. Max CR: 1/4 at L2 (no flying or swimming speed); 1/2 at L4 (no flying speed); 1 at L8. You retain your mental stats and class features but use the beast's physical stats. Lasts up to half your druid level in hours (minimum 1). Reverts when reduced to 0 HP.",
  },
  {
    name: "Timeless Body",
    level: 18,
    source: "class",
    description:
      "The primal magic you wield causes you to age more slowly. For every 10 years that pass, your body ages only 1 year.",
  },
  {
    name: "Beast Spells",
    level: 18,
    source: "class",
    description:
      "You can cast many druid spells in any shape you assume using Wild Shape. You can perform the somatic and verbal components of a druid spell while in beast form.",
  },
  {
    name: "Archdruid",
    level: 20,
    source: "class",
    description:
      "You can use your Wild Shape an unlimited number of times. Additionally, you can ignore the verbal and somatic components of your druid spells, as well as any material components lacking a cost.",
  },
];

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

const ROGUE_FEATURES: DerivedFeature[] = [
  {
    name: "Expertise",
    level: 1,
    source: "class",
    description:
      "Choose two of your skill proficiencies (or one skill + Thieves' Tools). Your proficiency bonus is doubled for those skills. Two more at level 6.",
  },
  {
    name: "Sneak Attack",
    level: 1,
    source: "class",
    description:
      "Once per turn, deal extra damage to a target you hit with a finesse or ranged weapon when you have advantage on the attack or an ally is adjacent to the target. 1d6 at L1, +1d6 every odd level (10d6 at L19).",
  },
  {
    name: "Thieves' Cant",
    level: 1,
    source: "class",
    description:
      "Secret mix of dialect and codewords used by thieves' guilds. Takes 4× as long to convey a message compared to open speech. Also understand signs and symbols used by criminals.",
  },
  {
    name: "Cunning Action",
    level: 2,
    source: "class",
    description:
      "As a bonus action, take the Dash, Disengage, or Hide action.",
  },
  {
    name: "Uncanny Dodge",
    level: 5,
    source: "class",
    description:
      "When an attacker you can see hits you, use your reaction to halve the attack's damage.",
  },
  {
    name: "Evasion",
    level: 7,
    source: "class",
    description:
      "When subjected to an effect that allows a Dexterity save for half damage, you take no damage on a success and half damage on a failure.",
  },
  {
    name: "Reliable Talent",
    level: 11,
    source: "class",
    description:
      "When making an ability check with a skill or tool you're proficient in, treat a d20 roll of 9 or lower as a 10.",
  },
  {
    name: "Blindsense",
    level: 14,
    source: "class",
    description:
      "If able to hear, you are aware of the location of any hidden or invisible creature within 10 feet.",
  },
  {
    name: "Slippery Mind",
    level: 15,
    source: "class",
    description: "You gain proficiency in Wisdom saving throws.",
  },
  {
    name: "Elusive",
    level: 18,
    source: "class",
    description:
      "No attack roll has advantage against you while you aren't incapacitated.",
  },
  {
    name: "Stroke of Luck",
    level: 20,
    source: "class",
    description:
      "If your attack misses a target in range, you can turn the miss into a hit. Or if you fail an ability check, you can treat the d20 roll as a 20. Once used, regain on a short or long rest.",
  },
];

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

// ── Base class dispatch tables ────────────────────────────────────────────────

const CLASS_FEATURE_LIST: Record<string, DerivedFeature[]> = {
  barbarian: BARBARIAN_FEATURES,
  bard: BARD_FEATURES,
  cleric: CLERIC_FEATURES,
  druid: DRUID_FEATURES,
  fighter: FIGHTER_FEATURES,
  monk: MONK_FEATURES,
  paladin: PALADIN_FEATURES,
  ranger: RANGER_FEATURES,
  rogue: ROGUE_FEATURES,
  sorcerer: SORCERER_FEATURES,
  warlock: WARLOCK_FEATURES,
  wizard: WIZARD_FEATURES,
};

const CLASS_RESOURCE_FN: Record<
  string,
  (level: number, abilityScores: Record<string, number>, profBonus: number) => DerivedResource[]
> = {
  barbarian: (level) => {
    const rageCount =
      level >= 20 ? 99 :
      level >= 17 ? 6 :
      level >= 12 ? 5 :
      level >= 6  ? 4 :
      level >= 3  ? 3 : 2;
    return [
      {
        key: "rage",
        label: "Rage",
        total: rageCount,
        recharge: "longRest",
        description: `Bonus action: enter a rage for up to 1 minute (ends early if you fall unconscious or choose to end it). Resistance to bludgeoning, piercing, and slashing damage (applied automatically) and advantage on Strength checks & saves while raging. Regain all rages on a long rest.${level >= 20 ? " Unlimited uses at level 20." : ""}`,
      },
    ];
  },

  bard: (level, abilityScores) => {
    const chaMod = abilityModifier(abilityScores.charisma ?? 10);
    const total = Math.max(1, chaMod);
    const die = level >= 15 ? "d12" : level >= 10 ? "d10" : level >= 5 ? "d8" : "d6";
    const recharge: RechargeOn = level >= 5 ? "short-or-long" : "longRest";
    return [
      {
        key: "bardicInspiration",
        label: "Bardic Inspiration",
        total,
        die,
        recharge,
        description: `Bonus action: grant one creature within 60 ft a Bardic Inspiration ${die}. They add it to one roll within 10 minutes. Regain all uses on ${level >= 5 ? "a short or long rest" : "a long rest"}.`,
      },
    ];
  },

  cleric: (level, abilityScores, profBonus) => {
    if (level < 2) return [];
    const total = level >= 18 ? 3 : level >= 6 ? 2 : 1;
    const wisMod = abilityModifier(abilityScores.wisdom ?? 10);
    const turnDC = 8 + profBonus + wisMod;
    return [
      {
        key: "channelDivinity",
        label: "Channel Divinity",
        total,
        recharge: "short-or-long",
        description: `Channel divine energy for special effects (Turn Undead DC ${turnDC}, plus domain options). Regain all uses on a short or long rest.`,
      },
    ];
  },

  druid: (level) => {
    if (level < 2) return [];
    const crCap =
      level >= 8 ? "1" :
      level >= 4 ? "1/2 (no flying speed)" :
      "1/4 (no flying or swimming speed)";
    return [
      {
        key: "wildShape",
        label: "Wild Shape",
        total: level >= 20 ? 99 : 2,
        recharge: "short-or-long",
        description: `Transform into a beast (max CR ${crCap}). Lasts up to ${Math.max(1, Math.floor(level / 2))} hour(s). Regain all uses on a short or long rest.${level >= 20 ? " Unlimited uses (Archdruid)." : ""}`,
      },
    ];
  },

  fighter: (level) => {
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

  monk: (level, abilityScores, profBonus) => {
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

  paladin: (level, abilityScores) => {
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

  sorcerer: (level) => {
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
};

// ── Subclass feature lists ────────────────────────────────────────────────────

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

const ARCANE_TRICKSTER_FEATURES: DerivedFeature[] = [
  {
    name: "Arcane Trickster Spellcasting",
    level: 3,
    source: "subclass",
    description:
      "You learn spells from the wizard list (primarily enchantment and illusion), casting with Intelligence. Third-caster progression starting at level 3.",
  },
  {
    name: "Mage Hand Legerdemain",
    level: 3,
    source: "subclass",
    description:
      "You know the Mage Hand cantrip. The hand is invisible and can pick locks, disarm traps, or steal items using your Sleight of Hand skill — even from creatures as long as you distract them.",
  },
  {
    name: "Magical Ambush",
    level: 9,
    source: "subclass",
    description:
      "If you are hidden when you cast a spell, the target has disadvantage on any saving throw it makes against the spell on the same turn.",
  },
  {
    name: "Versatile Trickster",
    level: 13,
    source: "subclass",
    description:
      "As a bonus action, direct your Mage Hand to distract a creature within 5 ft of it. Gain advantage on the next attack roll against that creature before the end of your turn.",
  },
  {
    name: "Spell Thief",
    level: 17,
    source: "subclass",
    description:
      "Immediately after a creature casts a spell that targets you, use your reaction to force it to make a saving throw with its spellcasting ability modifier (DC = your spell save DC). On failure, you negate the spell and steal it — you can cast it (same level) once without a slot within 8 hours. Once used, regain on a long rest.",
  },
];

const ASSASSIN_FEATURES: DerivedFeature[] = [
  {
    name: "Bonus Proficiencies",
    level: 3,
    source: "subclass",
    description:
      "You gain proficiency with the disguise kit and the poisoner's kit.",
  },
  {
    name: "Assassinate",
    level: 3,
    source: "subclass",
    description:
      "You have advantage on attack rolls against any creature that hasn't taken a turn yet this combat. Any hit against a surprised creature is a critical hit.",
  },
  {
    name: "Infiltration Expertise",
    level: 9,
    source: "subclass",
    description:
      "Spend 7 days and 25 gp creating a false identity, including documentation, established acquaintances, and disguises. You can't adopt an identity that belongs to someone else.",
  },
  {
    name: "Impostor",
    level: 13,
    source: "subclass",
    description:
      "After studying a creature for 3 hours, you can mimic its speech, writing, and behavior. A Wisdom (Insight) check contested by your Charisma (Deception) reveals the imposture.",
  },
  {
    name: "Death Strike",
    level: 17,
    source: "subclass",
    description:
      "When you hit a surprised creature, it must make a Constitution save (DC 8 + your Dexterity modifier + proficiency bonus) or take double damage from the attack.",
  },
];

const LIFE_DOMAIN_FEATURES: DerivedFeature[] = [
  {
    name: "Bonus Proficiency",
    level: 1,
    source: "subclass",
    description: "You gain proficiency with heavy armor.",
  },
  {
    name: "Disciple of Life",
    level: 1,
    source: "subclass",
    description:
      "Whenever you use a spell of 1st level or higher to restore hit points to a creature, the creature regains additional HP equal to 2 + the spell's level.",
  },
  {
    name: "Channel Divinity: Preserve Life",
    level: 2,
    source: "subclass",
    description:
      "As an action, evoke healing energy that restores a total of 5× your cleric level HP, divided among creatures within 30 ft (up to half their maximum HP each). Uses the Channel Divinity pool.",
  },
  {
    name: "Blessed Healer",
    level: 6,
    source: "subclass",
    description:
      "When you cast a healing spell of 1st level or higher that restores HP to another creature, you regain HP equal to 2 + the spell's level.",
  },
  {
    name: "Divine Strike",
    level: 8,
    source: "subclass",
    description:
      "Once per turn when you hit with a weapon, deal an extra 1d8 radiant damage (+2d8 at level 14).",
  },
  {
    name: "Supreme Healing",
    level: 17,
    source: "subclass",
    description:
      "When you would normally roll dice to restore HP with a spell, use the highest number possible instead of rolling.",
  },
];

const TRICKERY_DOMAIN_FEATURES: DerivedFeature[] = [
  {
    name: "Blessing of the Trickster",
    level: 1,
    source: "subclass",
    description:
      "As an action, touch a willing creature to give it advantage on Dexterity (Stealth) checks. Lasts 1 hour or until you use this feature again.",
  },
  {
    name: "Channel Divinity: Invoke Duplicity",
    level: 2,
    source: "subclass",
    description:
      "As an action, create an illusory duplicate of yourself within 30 ft that lasts for 1 minute (concentration). You can attack with advantage against a creature within 5 ft of the duplicate, and can cast spells as if from the duplicate's space. Uses the Channel Divinity pool.",
  },
  {
    name: "Channel Divinity: Cloak of Shadows",
    level: 6,
    source: "subclass",
    description:
      "As an action, become invisible until the end of your next turn. Uses the Channel Divinity pool.",
  },
  {
    name: "Divine Strike",
    level: 8,
    source: "subclass",
    description:
      "Once per turn when you hit with a weapon, deal an extra 1d8 poison damage (+2d8 at level 14).",
  },
  {
    name: "Improved Duplicity",
    level: 17,
    source: "subclass",
    description:
      "When you use Invoke Duplicity, you can create up to four duplicates instead of one. As a bonus action on your turn, move any number of them up to 30 ft (no more than 120 ft away from you).",
  },
];

const TOTEM_WARRIOR_FEATURES: DerivedFeature[] = [
  {
    name: "Spirit Seeker",
    level: 3,
    source: "subclass",
    description:
      "Gain the ability to cast Beast Sense and Speak with Animals as rituals.",
  },
  {
    name: "Totem Spirit",
    level: 3,
    source: "subclass",
    description:
      "Choose a totem animal and gain a benefit while raging. Bear: resistance to all damage except psychic. Eagle: Disengage/Dash as a bonus action; can't be opportunity attacked except by flying creatures. Wolf: allies have advantage on melee attacks against creatures within 5 ft of you.",
  },
  {
    name: "Aspect of the Beast",
    level: 6,
    source: "subclass",
    description:
      "Gain a magical benefit from a second totem animal (can be the same or different). Bear: carry twice the weight; advantage on Strength checks. Eagle: see up to 1 mile clearly, dim light as bright. Wolf: hunt with a group; allies can't be tracked when traveling.",
  },
  {
    name: "Spirit Walker",
    level: 10,
    source: "subclass",
    description:
      "Cast the Commune with Nature spell as a ritual.",
  },
  {
    name: "Totemic Attunement",
    level: 14,
    source: "subclass",
    description:
      "Gain a benefit from a third totem animal while raging. Bear: threatening presence — enemies within 5 ft have disadvantage on attacks against non-you targets. Eagle: fly speed equal to walking speed. Wolf: knock prone when you hit with melee attack as a bonus action.",
  },
];

const BERSERKER_FEATURES: DerivedFeature[] = [
  {
    name: "Frenzy",
    level: 3,
    source: "subclass",
    description:
      "When you rage, choose to go into a frenzy. For the rage's duration, make one melee weapon attack as a bonus action on each of your turns. When the rage ends, you suffer one level of exhaustion.",
  },
  {
    name: "Mindless Rage",
    level: 6,
    source: "subclass",
    description:
      "You can't be charmed or frightened while raging. If charmed or frightened when you rage, the effect is suspended for the duration.",
  },
  {
    name: "Intimidating Presence",
    level: 10,
    source: "subclass",
    description:
      "As an action, frighten one creature within 30 ft that can see and hear you. It must succeed on a Wisdom save (DC 8 + proficiency + Charisma modifier) or be frightened until the end of your next turn. On a success, the target is immune to this feature for 24 hours.",
  },
  {
    name: "Retaliation",
    level: 14,
    source: "subclass",
    description:
      "When you take damage from a creature within 5 ft, use your reaction to make one melee weapon attack against that creature.",
  },
];

const COLLEGE_OF_LORE_FEATURES: DerivedFeature[] = [
  {
    name: "Bonus Proficiencies",
    level: 3,
    source: "subclass",
    description:
      "You gain proficiency in three skills of your choice.",
  },
  {
    name: "Cutting Words",
    level: 3,
    source: "subclass",
    description:
      "When a creature within 60 ft that you can see makes an attack roll, ability check, or damage roll, use your reaction and expend one Bardic Inspiration die to subtract the number rolled from the creature's roll.",
  },
  {
    name: "Additional Magical Secrets",
    level: 6,
    source: "subclass",
    description:
      "Learn two spells from any class (including this one). They count as bard spells for you. This is in addition to the Magical Secrets you get at level 10.",
  },
  {
    name: "Peerless Skill",
    level: 14,
    source: "subclass",
    description:
      "When making an ability check, expend one Bardic Inspiration die to add the number rolled to the check. You can use this feature even if you're the one inspiring yourself.",
  },
];

const COLLEGE_OF_VALOR_FEATURES: DerivedFeature[] = [
  {
    name: "Bonus Proficiencies",
    level: 3,
    source: "subclass",
    description:
      "You gain proficiency with medium armor, shields, and martial weapons.",
  },
  {
    name: "Combat Inspiration",
    level: 3,
    source: "subclass",
    description:
      "A creature with a Bardic Inspiration die from you can also add it to a damage roll or use it as a reaction to add it to AC against one attack.",
  },
  {
    name: "Extra Attack",
    level: 6,
    source: "subclass",
    description: "You can attack twice whenever you take the Attack action.",
  },
  {
    name: "Battle Magic",
    level: 14,
    source: "subclass",
    description:
      "When you use your action to cast a bard spell, make one weapon attack as a bonus action.",
  },
];

const CIRCLE_OF_THE_LAND_FEATURES: DerivedFeature[] = [
  {
    name: "Bonus Cantrip",
    level: 2,
    source: "subclass",
    description:
      "You learn one additional druid cantrip of your choice.",
  },
  {
    name: "Natural Recovery",
    level: 2,
    source: "subclass",
    description:
      "Once per long rest during a short rest, choose expended spell slots to recover. The total levels of slots recovered can be up to half your druid level (rounded up, max 5th level).",
  },
  {
    name: "Circle Spells",
    level: 3,
    source: "subclass",
    description:
      "You gain access to additional spells based on your chosen terrain (arctic, coast, desert, forest, grassland, mountain, swamp, or Underdark). These spells are always prepared for you and don't count against your prepared spells.",
  },
  {
    name: "Land's Stride",
    level: 6,
    source: "subclass",
    description:
      "Moving through nonmagical difficult terrain costs no extra movement, and you can pass through nonmagical plants without being slowed. Advantage on saves against magically created or manipulated plants.",
  },
  {
    name: "Nature's Ward",
    level: 10,
    source: "subclass",
    description:
      "Immune to poison and disease. Elementals and fey can't charm or frighten you.",
  },
  {
    name: "Nature's Sanctuary",
    level: 14,
    source: "subclass",
    description:
      "When a beast or plant attacks you, it must make a Wisdom saving throw (DC 8 + proficiency + Wisdom modifier) or choose a different target. On a success, it is immune to this feature for 24 hours.",
  },
];

const CIRCLE_OF_THE_MOON_FEATURES: DerivedFeature[] = [
  {
    name: "Combat Wild Shape",
    level: 2,
    source: "subclass",
    description:
      "You can use Wild Shape as a bonus action. While transformed, you can expend a spell slot as a bonus action to regain 1d8 HP per level of the slot expended.",
  },
  {
    name: "Circle Forms",
    level: 2,
    source: "subclass",
    description:
      "You can use Wild Shape to transform into beasts with a challenge rating as high as 1 (instead of the base druid table). Starting at level 6, the max CR equals your druid level divided by 3 (rounded down, minimum 1).",
  },
  {
    name: "Primal Strike",
    level: 6,
    source: "subclass",
    description:
      "Your attacks while in beast form count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks.",
  },
  {
    name: "Elemental Wild Shape",
    level: 10,
    source: "subclass",
    description:
      "Expend two uses of Wild Shape to transform into an air, earth, fire, or water elemental.",
  },
  {
    name: "Thousand Forms",
    level: 14,
    source: "subclass",
    description:
      "You can cast the Alter Self spell at will without expending a spell slot.",
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

// ── Subclass dispatch tables ──────────────────────────────────────────────────
// Keys are lowercase subclass names (entry.subclass.toLowerCase()).
// Add new subclasses here as resources and features are implemented.

// The class level at which each subclass first grants its features.
// Defaults to 3 (schema default for CharacterClass.subclassLevel).
// Set lower when the SRD grants subclass features before level 3.
const SUBCLASS_GRANT_LEVEL: Record<string, number> = {
  "battle master": 3,
  "way of the four elements": 3,
  // Wizard traditions — features start at level 2
  "school of evocation": 2,
  "school of abjuration": 2,
  "school of illusion": 2,
  // Druid circles — features start at level 2
  "circle of the land": 2,
  "circle of the moon": 2,
  // Cleric domains — first features at level 1
  "life domain": 1,
  "trickery domain": 1,
  // Sorcerous origins — first features at level 1
  "draconic bloodline": 1,
  "wild magic": 1,
  // Warlock patrons — first features at level 1
  "the fiend": 1,
  "the archfey": 1,
  "the great old one": 1,
};

const SUBCLASS_RESOURCE_FN: Record<
  string,
  (level: number, abilityScores: Record<string, number>, profBonus: number) => DerivedResource[]
> = {
  "battle master": (level, abilityScores, profBonus) => {
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

  // School of Illusion — Illusory Self is a once-per-short-or-long-rest reaction
  "school of illusion": (level) => {
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

  // Way of the Open Hand — Wholeness of Body is once-per-long-rest
  "way of the open hand": (level) => {
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

  // Wild Magic Sorcerer — Tides of Chaos is once-per-long-rest (or until forced surge)
  "wild magic": () => [
    {
      key: "tidesOfChaos",
      label: "Tides of Chaos",
      total: 1,
      recharge: "longRest",
      description: "Gain advantage on one attack roll, ability check, or saving throw. Regain use on a long rest (DM may trigger a Wild Magic Surge to restore it early).",
    },
  ],

  // The Fiend — Dark One's Own Luck (L6)
  "the fiend": (level) => {
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

  // The Archfey — Fey Presence (L1), Misty Escape (L6), Dark Delirium (L14)
  "the archfey": (level) => {
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

  // The Great Old One — Entropic Ward (L6)
  "the great old one": (level) => {
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
};

const SUBCLASS_FEATURE_LIST: Record<string, DerivedFeature[]> = {
  "battle master": BATTLE_MASTER_FEATURES,
  champion: CHAMPION_FEATURES,
  "eldritch knight": ELDRITCH_KNIGHT_FEATURES,
  "school of evocation": SCHOOL_OF_EVOCATION_FEATURES,
  "school of abjuration": SCHOOL_OF_ABJURATION_FEATURES,
  "school of illusion": SCHOOL_OF_ILLUSION_FEATURES,
  "arcane trickster": ARCANE_TRICKSTER_FEATURES,
  assassin: ASSASSIN_FEATURES,
  "life domain": LIFE_DOMAIN_FEATURES,
  "trickery domain": TRICKERY_DOMAIN_FEATURES,
  "totem warrior": TOTEM_WARRIOR_FEATURES,
  berserker: BERSERKER_FEATURES,
  "college of lore": COLLEGE_OF_LORE_FEATURES,
  "college of valor": COLLEGE_OF_VALOR_FEATURES,
  "circle of the land": CIRCLE_OF_THE_LAND_FEATURES,
  "circle of the moon": CIRCLE_OF_THE_MOON_FEATURES,
  "way of the open hand": WAY_OF_THE_OPEN_HAND_FEATURES,
  "way of shadow": WAY_OF_SHADOW_FEATURES,
  "way of the four elements": FOUR_ELEMENTS_FEATURES,
  "oath of devotion": OATH_OF_DEVOTION_FEATURES,
  "oath of the ancients": OATH_OF_THE_ANCIENTS_FEATURES,
  "oath of vengeance": OATH_OF_VENGEANCE_FEATURES,
  hunter: HUNTER_FEATURES,
  "beast master": BEAST_MASTER_FEATURES,
  "draconic bloodline": DRACONIC_BLOODLINE_FEATURES,
  "wild magic": WILD_MAGIC_FEATURES,
  "the fiend": THE_FIEND_FEATURES,
  "the archfey": THE_ARCHFEY_FEATURES,
  "the great old one": THE_GREAT_OLD_ONE_FEATURES,
};

/**
 * Derives trackable resources (pools with totals/die/recharge) and static
 * feature descriptions for a character's class and subclass. Returns null
 * when the class is unknown and no data exists — callers should render nothing.
 *
 * Pure function — no DB access, safe to call in serializeCharacter.
 */
export function deriveResources(
  className: string,
  subclass: string | undefined,
  level: number,
  abilityScores: Record<string, number>,
  profBonus: number,
): DerivedClassInfo | null {
  const classKey = (className ?? "").toLowerCase();
  const subclassKey = (subclass ?? "").toLowerCase();

  // ── Base class layer ───────────────────────────────────────────────────────
  const baseResourceFn = CLASS_RESOURCE_FN[classKey];
  const baseFeatureList = CLASS_FEATURE_LIST[classKey];
  const basePools = baseResourceFn ? baseResourceFn(level, abilityScores, profBonus) : [];
  const baseFeatures = (baseFeatureList ?? []).filter((f) => f.level <= level);

  // ── Subclass layer (gated by grant level; scoped to subclass only) ─────────
  const subResourceFn = subclassKey ? SUBCLASS_RESOURCE_FN[subclassKey] : undefined;
  const subFeatureList = subclassKey ? SUBCLASS_FEATURE_LIST[subclassKey] : undefined;
  const grantLevel = SUBCLASS_GRANT_LEVEL[subclassKey] ?? 3;
  const subActive = subclassKey !== "" && (subResourceFn !== undefined || subFeatureList !== undefined) && level >= grantLevel;
  const subPools = subActive && subResourceFn ? subResourceFn(level, abilityScores, profBonus) : [];
  const subFeatures = subActive ? (subFeatureList ?? []).filter((f) => f.level <= level) : [];

  // ── Merge: base-wins on key collision; features sorted by level ────────────
  const seenPoolKeys = new Set(basePools.map((p) => p.key));
  const resources = [...basePools, ...subPools.filter((p) => !seenPoolKeys.has(p.key))];
  const features = [...baseFeatures, ...subFeatures].sort(
    (a, b) => a.level - b.level || a.name.localeCompare(b.name),
  );

  // Return null only for truly unknown/empty classes
  if (resources.length === 0 && features.length === 0) return null;

  const result: DerivedClassInfo = { resources, features };

  // Battle Master extras — independent of base/subclass merge
  if (subclassKey === "battle master" && level >= 3) {
    result.maneuverChoiceCount = battleMasterManeuverCount(level);
    const strMod = abilityModifier(abilityScores.strength ?? 10);
    const dexMod = abilityModifier(abilityScores.dexterity ?? 10);
    result.maneuverSaveDC = 8 + profBonus + Math.max(strMod, dexMod);
    result.toolProfChoiceCount = studentOfWarToolCount(level);
  }

  // Way of the Four Elements — disciplines known scale with monk level
  if (subclassKey === "way of the four elements" && level >= 3) {
    result.disciplineChoiceCount = fourElementsDisciplineCount(level);
    result.disciplineSaveDC = kiSaveDC(abilityScores, profBonus);
  }

  // Way of Shadow — Shadow Arts ki-cast spells unlock at monk level 3
  if (subclassKey === "way of shadow" && level >= 3) {
    result.shadowArtsAvailable = true;
  }

  // Way of Shadow — Cloak of Shadows self-invisible toggle unlocks at monk level 11
  if (subclassKey === "way of shadow" && level >= 11) {
    result.cloakOfShadowsAvailable = true;
  }

  return result;
}

/**
 * Row-shaped convenience wrapper over {@link deriveResources}: derives level and
 * proficiency bonus from a character row's XP + primary class entry, then returns
 * that class's non-slot resource derivation plus the computed `level` — consumers
 * that also need level-scaled cost math (e.g. a future `disciplines.ts` migration)
 * can destructure `level` directly. Shared by the die-fueled activated-ability
 * handlers (maneuvers, shadow arts), which each re-read the same
 * {name, subclass} + XP + abilityScores select shape per op.
 */
export function deriveResourcesForCharacterRow(row: {
  experiencePoints: number;
  abilityScores: unknown;
  classEntries: { name: string; subclass: string | null }[];
}): { derived: DerivedClassInfo | null; level: number } {
  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const primaryEntry = row.classEntries[0];
  const abilityScores = row.abilityScores as Record<string, number>;
  const derived = deriveResources(
    primaryEntry?.name ?? "",
    primaryEntry?.subclass ?? undefined,
    level,
    abilityScores,
    profBonus,
  );
  return { derived, level };
}
