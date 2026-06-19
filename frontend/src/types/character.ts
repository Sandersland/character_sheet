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

export interface Currency {
  cp: number;
  sp: number;
  gp: number;
  pp: number;
}

export type ItemCategory = "weapon" | "armor" | "consumable" | "gear";

/**
 * Baseline equipment catalog served by `GET /api/items` — the "pick a
 * club, don't hand-author one" path for the inventory editor (Phase B).
 * `InventoryItem` below snapshots these fields rather than referencing this
 * type live; see backend's schema.prisma comment on Item/InventoryItem.
 */
export interface Item {
  id: string;
  name: string;
  category: ItemCategory;
  weight?: number;
  cost?: Currency;
  damageDice?: string; // e.g. "1d4" (weapons)
  damageType?: string; // e.g. "bludgeoning" (weapons)
  armorClass?: number; // base AC or shield bonus (armor)
  properties: string[]; // e.g. ["light", "finesse", "thrown"]
  description?: string;
}

/**
 * A character's own copy of an item's stats, optionally traced back to a
 * catalog `Item` via `itemId` (undefined means homebrew/no catalog match —
 * same nullable-FK-plus-own-fields shape as race/background selections).
 * Every field below is this row's own value, free to diverge from the
 * catalog (e.g. renaming "Club" to "Club +1" after a magic bonus).
 */
export interface InventoryItem {
  id: string;
  itemId?: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  weight?: number;
  cost?: Currency;
  damageDice?: string;
  damageType?: string;
  armorClass?: number;
  properties: string[];
  description?: string;
  equipped: boolean;
  notes?: string;
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
  currency: Currency;

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

/**
 * Baseline catalog entries served by `GET /api/reference`, used to populate
 * the character-creation form. These are *suggestions* the backend can
 * derive mechanics from — a created character's race/class/background name
 * can still drift from (or omit) a catalog match; see backend's
 * schema.prisma for the reasoning.
 */
export interface RaceOption {
  id: string;
  name: string;
  speed: number;
}

export interface ClassOption {
  id: string;
  name: string;
  hitDie: string;
  savingThrows: AbilityName[];
  skillChoiceCount: number;
  skillChoices: SkillName[];
  isSpellcaster: boolean;
}

export interface BackgroundOption {
  id: string;
  name: string;
  skillProficiencies: SkillName[];
}

export interface ReferenceData {
  races: RaceOption[];
  classes: ClassOption[];
  backgrounds: BackgroundOption[];
  alignments: string[];
}

/** Body for `POST /api/characters`. The backend derives AC/HP/saves/skills
 * from `race`/`classes[0]`/`abilityScores` — see backend's
 * src/lib/srd.ts — rather than the client computing and sending them. */
export interface CreateCharacterInput {
  name: string;
  alignment: string;
  portraitUrl?: string | null;
  experiencePoints?: number;
  race: string;
  background: string;
  classes: [{ name: string; subclass?: string | null }];
  abilityScores: AbilityScores;
  skillProficiencies?: SkillName[];
}
