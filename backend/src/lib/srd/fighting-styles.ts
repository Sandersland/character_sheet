// Selectable class-feature choice gained by a Fighter at level 1 (and other
// martial classes later — Paladin/Ranger out of scope for now). The CHOSEN
// style key is the only thing persisted (Character.resources.fightingStyle);
// its mechanical effects are derived at read time, never stored. The frontend
// resolves display text through a label map keyed off these entries — never by
// rendering a raw style key. Mirrors the CONDITIONS data block + isKnownCondition
// guard in condition-data.ts.

import { effectiveEntryLevel } from "@/lib/leveling/effective-levels.js";

export type FightingStyleKey =
  | "archery"
  | "defense"
  | "dueling"
  | "greatWeaponFighting"
  | "protection"
  | "twoWeaponFighting";

export interface FightingStyleDefinition {
  key: FightingStyleKey;
  label: string;
  description: string;
}

export const FIGHTING_STYLES: readonly FightingStyleDefinition[] = [
  {
    key: "archery",
    label: "Archery",
    description: "You gain a +2 bonus to attack rolls you make with ranged weapons.",
  },
  {
    key: "defense",
    label: "Defense",
    description: "While you are wearing armor, you gain a +1 bonus to AC.",
  },
  {
    key: "dueling",
    label: "Dueling",
    description:
      "When you are wielding a melee weapon in one hand and no other weapons, you gain a +2 bonus to damage rolls with that weapon.",
  },
  {
    key: "greatWeaponFighting",
    label: "Great Weapon Fighting",
    description:
      "When you roll a 1 or 2 on a damage die for an attack you make with a melee weapon that you are wielding with two hands, you can reroll the die and must use the new roll.",
  },
  {
    key: "protection",
    label: "Protection",
    description:
      "When a creature you can see attacks a target other than you that is within 5 feet of you, you can use your reaction to impose disadvantage on the attack roll. You must be wielding a shield.",
  },
  {
    key: "twoWeaponFighting",
    label: "Two-Weapon Fighting",
    description:
      "When you engage in two-weapon fighting, you can add your ability modifier to the damage of the second attack.",
  },
];

/** Returns true if `key` is a known fighting-style key. */
export function isKnownFightingStyle(key: string): key is FightingStyleKey {
  return FIGHTING_STYLES.some((s) => s.key === key);
}

/**
 * How many Fighting Style choices the character is entitled to at this level.
 * Fighter gains one at level 1. Non-fighters get 0 for now (Paladin/Ranger and
 * the Fighter's Champion second style at L10 are out of scope). The result is a
 * level-gated cap consumed by the transaction validator and the read-clamp.
 */
export function fightingStyleChoiceCount(className: string, level: number): number {
  return className.toLowerCase() === "fighter" && level >= 1 ? 1 : 0;
}

/**
 * Total Fighting Style entitlement across every class entry, each judged at its
 * own effective class level (#1065: a wizard/Fighter multiclass IS entitled via
 * the Fighter entry). The single shared rule for setFightingStyle,
 * reconcileFightingStyle, and the serializeCharacter read-clamp — never inline
 * a per-entry copy at those sites.
 */
export function characterFightingStyleChoiceCount(
  entries: readonly { name: string; level: number }[],
  derivedLevel: number,
): number {
  return entries.reduce(
    (sum, e) => sum + fightingStyleChoiceCount(e.name, effectiveEntryLevel(e.level, entries.length, derivedLevel)),
    0,
  );
}

/**
 * Derives the additive bonuses a chosen Fighting Style contributes to derived
 * stats. Today only Defense (+1 AC) is a simple additive bonus; the others are
 * conditional/situational (archery is handled in deriveWeaponAttackBonus;
 * dueling/great-weapon/two-weapon/protection are descriptive for now).
 */
export function deriveFightingStyleBonuses(
  styleKey: FightingStyleKey | null | undefined,
): { armorClass: number } {
  return { armorClass: styleKey === "defense" ? 1 : 0 };
}
