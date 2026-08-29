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

export const ABILITY_ORDER: readonly AbilityName[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
];

export const ABILITY_OPTIONS: readonly { key: AbilityName; label: string }[] =
  ABILITY_ORDER.map((key) => ({ key, label: ABILITY_LABELS[key] }));

export function orderedAbilityEntries(
  scores: Record<AbilityName, number>
): [AbilityName, number][] {
  return ABILITY_OPTIONS.map(
    ({ key }) => [key, scores[key]] as [AbilityName, number]
  );
}

// Key order mirrors backend SKILLS (lib/srd/alignments.ts) so skill lists render in SRD order.
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

// Tolerant: an unknown key degrades to itself rather than `undefined`.
export function skillLabel(key: string): string {
  return SKILL_LABELS[key as SkillName] ?? key;
}

export function abilityLabel(key: string): string {
  return ABILITY_LABELS[key as AbilityName] ?? key;
}

export const ARMOR_CATEGORY_LABELS: Record<ArmorProficiencyCategory, string> = {
  light:  "Light Armor",
  medium: "Medium Armor",
  heavy:  "Heavy Armor",
  shield: "Shields",
};

export const ARMOR_CATEGORY_ORDER: readonly ArmorProficiencyCategory[] = [
  "light", "medium", "heavy", "shield",
];

export type ProficiencySource = "class" | "feat" | "background" | "subclass" | "item";

export const SOURCE_LABELS: Record<ProficiencySource, string> = {
  class:      "Class",
  feat:       "Feat",
  background: "Background",
  subclass:   "Battle Master",
  item:       "Item",
};

export function sourcePillLabel(source: ProficiencySource): string {
  const words = SOURCE_LABELS[source].split(" ");
  return words.length > 1 ? words.map((w) => w[0]).join("").toUpperCase() : words[0];
}

export function abilityAbbr(key: string): string {
  return abilityLabel(key).slice(0, 3).toUpperCase();
}

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
