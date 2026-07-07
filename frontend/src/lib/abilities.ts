import type { AbilityName, ArmorProficiencyCategory, SkillName } from "@/types/character";

export const ABILITY_LABELS: Record<AbilityName, string> = {
  strength: "Strength",
  dexterity: "Dexterity",
  constitution: "Constitution",
  intelligence: "Intelligence",
  wisdom: "Wisdom",
  charisma: "Charisma",
};

const SKILL_LABELS: Record<SkillName, string> = {
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

/** Ability scores in canonical 5e rail order (STR-DEX-CON-INT-WIS-CHA),
 *  regardless of the input object's key order. Single source of ability-rail
 *  ordering shared by the page and its regression test. */
export function orderedAbilityEntries(
  scores: Record<AbilityName, number>
): [AbilityName, number][] {
  return ABILITY_OPTIONS.map(
    ({ key }) => [key, scores[key]] as [AbilityName, number]
  );
}

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

/** Display labels for armor proficiency categories. */
export const ARMOR_CATEGORY_LABELS: Record<ArmorProficiencyCategory, string> = {
  light:  "Light Armor",
  medium: "Medium Armor",
  heavy:  "Heavy Armor",
  shield: "Shields",
};

/** Canonical display order for armor categories (light → medium → heavy → shields). */
export const ARMOR_CATEGORY_ORDER: readonly ArmorProficiencyCategory[] = [
  "light", "medium", "heavy", "shield",
];

/** Union of all proficiency grant sources used across weapons, armor, and tools. */
export type ProficiencySource = "class" | "race" | "feat" | "background" | "subclass" | "item";

/** Human-readable labels for every proficiency source. Used by ProficienciesCard
 *  across all three sub-sections so weapons, armor, and tools share one map. */
export const SOURCE_LABELS: Record<ProficiencySource, string> = {
  class:      "Class",
  race:       "Race",
  feat:       "Feat",
  background: "Background",
  subclass:   "Battle Master",
  item:       "Item",
};

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
  expertise = false,
  tempModifier = 0
): number {
  const base = abilityModifier(abilityScore);
  const profTerm = expertise ? proficiencyBonus * 2 : proficient ? proficiencyBonus : 0;
  return base + profTerm + tempModifier;
}
