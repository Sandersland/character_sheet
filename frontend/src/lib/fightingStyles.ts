import type { FightingStyleKey } from "@/types/character";

/**
 * Display labels + descriptions for the 6 core Fighting Styles. Mirrors the
 * backend rules data in src/lib/srd.ts (FIGHTING_STYLES) — the backend remains
 * the single source of truth for rules and derived effects; this is presentation
 * metadata only (labels/descriptions for the picker). Never render a raw style
 * key in the UI; resolve through fightingStyleLabel().
 */

export const FIGHTING_STYLE_LABELS: Record<FightingStyleKey, string> = {
  archery: "Archery",
  defense: "Defense",
  dueling: "Dueling",
  greatWeaponFighting: "Great Weapon Fighting",
  protection: "Protection",
  twoWeaponFighting: "Two-Weapon Fighting",
};

export const FIGHTING_STYLE_DESCRIPTIONS: Record<FightingStyleKey, string> = {
  archery: "You gain a +2 bonus to attack rolls you make with ranged weapons.",
  defense: "While you are wearing armor, you gain a +1 bonus to AC.",
  dueling:
    "When wielding a melee weapon in one hand and no other weapons, you gain a +2 bonus to damage rolls with that weapon.",
  greatWeaponFighting:
    "When you roll a 1 or 2 on a damage die for an attack with a two-handed melee weapon, you can reroll the die and must use the new roll.",
  protection:
    "When a creature attacks a target other than you within 5 feet, you can use your reaction to impose disadvantage on the attack roll. You must be wielding a shield.",
  twoWeaponFighting:
    "When you engage in two-weapon fighting, you can add your ability modifier to the damage of the second attack.",
};

/** Canonical order for iterating styles in the picker (matches srd.ts order). */
const FIGHTING_STYLE_ORDER: readonly FightingStyleKey[] = [
  "archery",
  "defense",
  "dueling",
  "greatWeaponFighting",
  "protection",
  "twoWeaponFighting",
];

export const FIGHTING_STYLE_OPTIONS: readonly {
  key: FightingStyleKey;
  label: string;
  description: string;
}[] = FIGHTING_STYLE_ORDER.map((key) => ({
  key,
  label: FIGHTING_STYLE_LABELS[key],
  description: FIGHTING_STYLE_DESCRIPTIONS[key],
}));

/** Display label for a fighting style key. Tolerant: unknown keys degrade to self. */
export function fightingStyleLabel(key: string): string {
  return FIGHTING_STYLE_LABELS[key as FightingStyleKey] ?? key;
}
