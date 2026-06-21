import type { AbilityName, SkillName } from "@/types/character";

export const ABILITY_LABELS: Record<AbilityName, string> = {
  strength: "Strength",
  dexterity: "Dexterity",
  constitution: "Constitution",
  intelligence: "Intelligence",
  wisdom: "Wisdom",
  charisma: "Charisma",
};

export const SKILL_LABELS: Record<SkillName, string> = {
  acrobatics: "Acrobatics",
  animalHandling: "Animal Handling",
  arcana: "Arcana",
  athletics: "Athletics",
  deception: "Deception",
  history: "History",
  insight: "Insight",
  intimidation: "Intimidation",
  investigation: "Investigation",
  medicine: "Medicine",
  nature: "Nature",
  perception: "Perception",
  performance: "Performance",
  persuasion: "Persuasion",
  religion: "Religion",
  sleightOfHand: "Sleight of Hand",
  stealth: "Stealth",
  survival: "Survival",
};

// Canonical 5e ability order. The single source for any UI that iterates
// abilities (ability-score editor, ASI/feat pickers, saving throws).
export const ABILITY_ORDER: readonly AbilityName[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
];

// Ready-made option lists derived from the label tables above so keys and
// labels can never drift. Selection UIs should iterate these instead of
// hand-rolling { key, label } arrays.
export const ABILITY_OPTIONS: readonly { key: AbilityName; label: string }[] =
  ABILITY_ORDER.map((key) => ({ key, label: ABILITY_LABELS[key] }));

// Each skill's governing ability — display/selection metadata mirroring the
// backend srd.ts SKILLS order (rules logic stays on the backend).
const SKILL_ABILITY: Record<SkillName, AbilityName> = {
  acrobatics: "dexterity",
  animalHandling: "wisdom",
  arcana: "intelligence",
  athletics: "strength",
  deception: "charisma",
  history: "intelligence",
  insight: "wisdom",
  intimidation: "charisma",
  investigation: "intelligence",
  medicine: "wisdom",
  nature: "intelligence",
  perception: "wisdom",
  performance: "charisma",
  persuasion: "charisma",
  religion: "intelligence",
  sleightOfHand: "dexterity",
  stealth: "dexterity",
  survival: "wisdom",
};

export const SKILL_OPTIONS: readonly {
  key: SkillName;
  label: string;
  ability: AbilityName;
}[] = (Object.keys(SKILL_LABELS) as SkillName[]).map((key) => ({
  key,
  label: SKILL_LABELS[key],
  ability: SKILL_ABILITY[key],
}));

/** Display label for a skill key (e.g. "animalHandling" → "Animal Handling").
 *  Tolerant: an unknown key degrades to itself rather than `undefined`. */
export function skillLabel(key: string): string {
  return SKILL_LABELS[key as SkillName] ?? key;
}

/** Display label for an ability key (e.g. "strength" → "Strength"). */
export function abilityLabel(key: string): string {
  return ABILITY_LABELS[key as AbilityName] ?? key;
}

/** Three-letter uppercase ability abbreviation (e.g. "strength" → "STR"). */
export function abilityAbbr(key: string): string {
  return abilityLabel(key).slice(0, 3).toUpperCase();
}

/** Standard 5e modifier: floor((score - 10) / 2). */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(modifier: number): string {
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

export function skillBonus(
  abilityScore: number,
  proficiencyBonus: number,
  proficient: boolean,
  expertise = false
): number {
  const base = abilityModifier(abilityScore);
  if (expertise) return base + proficiencyBonus * 2;
  if (proficient) return base + proficiencyBonus;
  return base;
}
