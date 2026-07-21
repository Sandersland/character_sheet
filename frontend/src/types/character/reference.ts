/**
 * Character-creation reference data (GET /api/reference) and the create-character body.
 */

import type { WeaponClass, WeaponRange } from "./inventory";
import type { AbilityName, AbilityScores, SkillName } from "./primitives";

/** Subclass option (from GET /api/reference). */
export interface SubclassOption {
  id: string;
  name: string;
  description: string;
}

/**
 * Baseline catalog entries served by `GET /api/reference`, used to populate
 * the character-creation form. These are *suggestions* the backend can
 * derive mechanics from — a created character's race/class/background name
 * can still drift from (or omit) a catalog match (the catalog+snapshot pattern).
 */
export interface RaceOption {
  id: string;
  name: string;
  speed: number;
  toolProficiencies: string[];
}

/**
 * Starting equipment types — mirror of the backend `ClassStartingEquipment` /
 * `STARTING_EQUIPMENT`. The frontend receives these from GET /api/reference
 * (attached to each ClassOption) and never needs to hardcode them itself.
 */
export interface WeaponPoolFilter {
  weaponClass?: WeaponClass;
  range?: WeaponRange;
}

export interface FixedItemRef {
  catalogName: string;
  quantity?: number;
}

export interface OpenWeaponPick {
  label: string;
  filter: WeaponPoolFilter;
  quantity?: number;
}

export interface EquipmentBundle {
  label: string;
  items?: FixedItemRef[];
  openPicks?: OpenWeaponPick[];
}

export interface EquipmentChoiceGroup {
  label: string;
  options: EquipmentBundle[];
}

export interface StartingGold {
  diceCount: number;
  diceFaces: number;
  multiplier: number;
}

export interface ClassStartingEquipment {
  groups: EquipmentChoiceGroup[];
  gold: StartingGold;
}

/** Reference types (GET /api/reference) that populate the character-creation form. */
export interface ClassOption {
  id: string;
  name: string;
  hitDie: string;
  savingThrows: AbilityName[];
  skillChoiceCount: number;
  skillChoices: SkillName[];
  isSpellcaster: boolean;
  /** Character level at which this class grants a subclass (1, 2, or 3). */
  subclassLevel: number;
  /** Available subclasses for this class, ordered alphabetically. */
  subclasses: SubclassOption[];
  /** Starting equipment definition, null if the class has no package defined. */
  startingEquipment: ClassStartingEquipment | null;
  /**
   * 5e multiclass ability prerequisite (PHB p. 163) — option thresholds plus a
   * rendered description. Null for homebrew classes (no prerequisite). The picker
   * evaluates `options` against the character's scores; ANY option satisfied = met.
   */
  multiclassPrerequisite: {
    options: Record<string, number>[];
    description: string;
  } | null;
  /** Fixed tool proficiencies always granted by this class. */
  toolProficiencies: string[];
  /** Tool names the player may choose from at creation. */
  toolChoices: string[];
  /** Number of tool choices the player may make. */
  toolChoiceCount: number;
  /** #1131: level-1 creation pick counts (SRD 5.2); null for a non-caster. */
  level1SpellPicks: { cantrips: number; spells: number } | null;
  /** #1161: PHB'24 primary ability/abilities the creation panel recommends; [] for homebrew. */
  primaryAbility: AbilityName[];
}

/** A background's Origin feat (PHB'24), served by GET /api/reference. */
export interface OriginFeatOption {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface BackgroundOption {
  id: string;
  name: string;
  skillProficiencies: SkillName[];
  toolProficiencies: string[];
  /** The three abilities the +2/+1 (or 1/1/1) spread draws from; empty for spec-less legacy rows. */
  abilityChoices: AbilityName[];
  /** The Origin feat granted at creation; null for spec-less legacy rows. */
  originFeat: OriginFeatOption | null;
}

/** One tool from the SRD TOOLS constant, served by GET /api/reference. */
export interface ToolOption {
  name: string;
  category: "artisan" | "gamingSet" | "musicalInstrument" | "other";
  cost?: { gp?: number; sp?: number; cp?: number };
  weight?: number;
}

export interface ReferenceData {
  races: RaceOption[];
  classes: ClassOption[];
  backgrounds: BackgroundOption[];
  alignments: string[];
  /** Artisan's tools for the sheet's Proficiencies-card dropdown. */
  artisanTools: ToolOption[];
}

/** Body for `POST /api/characters`. The backend derives AC/HP/saves/skills
 * from `race`/`classes[0]`/`abilityScores` via `deriveCreatedCharacter` —
 * rather than the client computing and sending them. */
// One selection per equipment choice group when mode:"package".
export interface PackageSelection {
  optionIndex: number;
  openPicks?: string[]; // catalog item names, in the bundle's openPick order
}

export type StartingEquipmentInput =
  | { mode: "package"; selections: PackageSelection[] }
  | { mode: "gold"; gold: number };

export interface CreateCharacterInput {
  name: string;
  alignment: string;
  portraitUrl?: string | null;
  experiencePoints?: number;
  race: string;
  background: string;
  classes: [{ name: string; subclass?: string | null; subclassId?: string }];
  abilityScores: AbilityScores;
  /** PHB'24 background ability spread (2+1 or 1+1+1 over the background's three
   *  abilityChoices); omitted for custom/spec-less backgrounds (#1130). */
  backgroundAbilities?: Partial<Record<AbilityName, number>>;
  skillProficiencies?: SkillName[];
  /** Tool names chosen by the player (from class toolChoices). */
  toolChoices?: string[];
  startingEquipment?: StartingEquipmentInput;
  /** #1131: a level-1 caster's chosen cantrips + prepared spells (catalog ids). */
  spells?: { cantripIds: string[]; spellIds: string[] };
}
