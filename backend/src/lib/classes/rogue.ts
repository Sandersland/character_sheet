import { readEffectSpec, resolveEffectSpec, type ClassDieResolver, type EffectRow } from "@/lib/combat/effects.js";
import type { ClassDefinition, DerivedFeature } from "./types.js";

// Sneak Attack is a C5 referenced-class-die consumer: a fixed d6 whose COUNT is
// rogue-level-derived. The die is resolved through the same effects.ts machinery
// (effectDieSource + ClassDieResolver + readEffectSpec) the Battle Master uses,
// but the rogue die never grows, so it needs no resolveClassDie pool.
export const SNEAK_ATTACK_DIE_SOURCE = "sneakAttackDice";

// 1d6 at L1, +1d6 every odd level, capped at 10d6 from L19. 0 below L1.
export function sneakAttackDiceCount(rogueLevel: number): number {
  if (rogueLevel < 1) return 0;
  return Math.min(10, Math.ceil(rogueLevel / 2));
}

// The referenced-class-die resolver for the C5 machinery: the rogue die is a
// flat d6 (never scales with level, unlike the superiority die).
export const resolveSneakAttackDie: ClassDieResolver = (source) =>
  source === SNEAK_ATTACK_DIE_SOURCE ? 6 : null;

function sneakAttackEffectRow(rogueLevel: number): EffectRow {
  return {
    level: 1,
    effectKind: "damage",
    effectDiceCount: sneakAttackDiceCount(rogueLevel),
    effectDieSource: SNEAK_ATTACK_DIE_SOURCE,
  };
}

// The resolved Nd6 dice for a rogue's Sneak Attack, or null below L1. Routes
// through readEffectSpec/resolveEffectSpec so the die-source resolution matches
// every other referenced-class-die effect.
export function sneakAttackSpec(rogueLevel: number): { count: number; faces: number; modifier: number } | null {
  if (sneakAttackDiceCount(rogueLevel) <= 0) return null;
  const spec = readEffectSpec(sneakAttackEffectRow(rogueLevel), resolveSneakAttackDie);
  return resolveEffectSpec(spec, 0, { characterLevel: rogueLevel });
}

// Once-per-turn + eligibility guard. Eligibility (advantage OR an ally adjacent
// to the target) is a manual assertion — never auto-detected from board state.
export function canApplySneakAttack(input: { eligible: boolean; usedThisTurn: boolean }): boolean {
  return input.eligible && !input.usedThisTurn;
}

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

const THIEF_FEATURES: DerivedFeature[] = [
  {
    name: "Fast Hands",
    level: 3,
    source: "subclass",
    description:
      "Use the Cunning Action bonus action to make a Sleight of Hand check, use Thieves' Tools to disarm a trap or open a lock, or take the Use an Object action.",
  },
  {
    name: "Second-Story Work",
    level: 3,
    source: "subclass",
    description:
      "Climbing no longer costs extra movement. When you make a running jump, the distance you cover increases by a number of feet equal to your Dexterity modifier.",
  },
  {
    name: "Supreme Sneak",
    level: 9,
    source: "subclass",
    description:
      "You have advantage on a Dexterity (Stealth) check if you move no more than half your speed on the same turn.",
  },
  {
    name: "Use Magic Device",
    level: 13,
    source: "subclass",
    description:
      "You ignore all class, race, and level requirements on the use of magic items.",
  },
  {
    name: "Thief's Reflexes",
    level: 17,
    source: "subclass",
    description:
      "You take two turns during the first round of any combat: your first turn at your normal initiative and your second at your initiative minus 10. You can't use this feature when surprised.",
  },
];

export const rogue: ClassDefinition = {
  features: ROGUE_FEATURES,
  subclasses: {
    "arcane trickster": { grantLevel: 3, features: ARCANE_TRICKSTER_FEATURES },
    assassin: { grantLevel: 3, features: ASSASSIN_FEATURES },
    thief: { grantLevel: 3, features: THIEF_FEATURES },
  },
};
