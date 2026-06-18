/**
 * Shape of character data returned by `GET /api/characters` and
 * `GET /api/characters/:id`. `level`/`proficiencyBonus`/threshold fields
 * are derived server-side from `experiencePoints` (see backend's
 * src/lib/experience.ts) and never set directly by the client.
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
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  weight?: number;
  equipped?: boolean;
  description?: string;
}

export type SpellSchool =
  | "abjuration"
  | "conjuration"
  | "divination"
  | "enchantment"
  | "evocation"
  | "illusion"
  | "necromancy"
  | "transmutation";

export interface Spell {
  id: string;
  name: string;
  level: number; // 0 = cantrip
  school: SpellSchool;
  prepared?: boolean;
  castingTime: string;
  range: string;
  duration: string;
  description: string;
}

export interface SpellSlots {
  level: number;
  total: number;
  used: number;
}

export interface JournalEntry {
  id: string;
  title: string;
  date: string;
  body: string;
}

export interface Character {
  id: string;
  name: string;
  race: string;
  class: string;
  subclass?: string;
  level: number;
  experiencePoints: number;
  currentLevelThreshold: number;
  nextLevelThreshold: number | null;
  background: string;
  alignment: string;
  portraitUrl?: string;

  armorClass: number;
  initiativeBonus: number;
  speed: number;
  proficiencyBonus: number;

  hitPoints: {
    current: number;
    max: number;
    temp: number;
  };
  hitDice: {
    total: number;
    die: string; // e.g. "d10"
  };

  abilityScores: AbilityScores;
  savingThrowProficiencies: AbilityName[];
  skills: Skill[];

  inventory: InventoryItem[];
  currency: {
    cp: number;
    sp: number;
    gp: number;
    pp: number;
  };

  spellcasting?: {
    ability: AbilityName;
    spellSaveDC: number;
    spellAttackBonus: number;
    slots: SpellSlots[];
    spells: Spell[];
  };

  journal: JournalEntry[];
}

export interface CharacterSummary {
  id: string;
  name: string;
  race: string;
  class: string;
  level: number;
  portraitUrl?: string;
}
