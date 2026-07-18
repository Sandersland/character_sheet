/**
 * Core ability / skill / currency scalar types shared across the character wire model.
 */

export type AbilityName =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma";

export interface AbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export type SkillName =
  | "acrobatics"
  | "animalHandling"
  | "arcana"
  | "athletics"
  | "deception"
  | "history"
  | "insight"
  | "intimidation"
  | "investigation"
  | "medicine"
  | "nature"
  | "perception"
  | "performance"
  | "persuasion"
  | "religion"
  | "sleightOfHand"
  | "stealth"
  | "survival";

export interface Skill {
  name: SkillName;
  ability: AbilityName;
  proficient: boolean;
  expertise?: boolean;
  /** Active cast-granted buff total (#438). Absent when no buff targets this skill. */
  tempModifier?: number;
  /** Per-source breakdown of tempModifier, for display. */
  tempModifierSources?: { label: string; value: number }[];
}

export interface Currency {
  cp: number;
  sp: number;
  gp: number;
  pp: number;
}
