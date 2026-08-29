import type { AbilityGenerationMethod, ClassStartingEquipment, RulesEdition } from "@character-sheet/shared-types";

import type { ActionCost } from "./actions";
import type { ConditionKey } from "./combat";
import type { ItemRarity } from "./inventory";
import type { AbilityName, AbilityScores, SkillName } from "./primitives";

export type { ClassStartingEquipment, AbilityGenerationMethod };
export type { EquipmentBundle, EquipmentChoiceGroup, OpenPick, StartingGold } from "@character-sheet/shared-types";

/** Subclass option (from GET /api/reference). */
export interface SubclassOption {
  id: string;
  name: string;
  description: string;
}

/** Wire-shape mirror only; the backend decides what an ability bump is worth (`resolveSpeciesGrants`). */
export type AbilityIncreaseSpec =
  | { ability: AbilityName; amount: number }
  | { choose: { count: number; amount: number; from?: AbilityName[] } }
  | { floating: number };

/** `null` on both SpeciesOption/SpeciesVariantOption means no choice served (server-resolved, no client edition logic). */
export interface SpeciesSkillChoiceOption {
  count: number;
  /** Omitted = any of the 18 skills is eligible. */
  from?: SkillName[];
}

export interface SpeciesCantripChoiceOption {
  /** Exactly one of `list`/`spells` is present; `list` is a lowercase class name, queried via `GET /api/spells?class=`. */
  list?: string;
  /** The picker fetches all cantrips and filters to these by name. */
  spells?: string[];
  /** Absent = the player chooses Int/Wis/Cha via the identity step; present pins a fixed ability. */
  castingAbility?: AbilityName;
}

/** Resolved live against the Feat catalog at create time; never a fixed list baked into the row. */
export type SpeciesOriginFeatChoiceOption = boolean;

/** An empty `variants` array renders no variant step. */
export interface SpeciesVariantOption {
  id: string;
  name: string;
  slug: string;
  /** Additive to the parent species' own abilityIncreases; [] for every 2024 row. */
  abilityIncreases: AbilityIncreaseSpec[];
  /** False for every real subrace; true means `abilityIncreases` replaces the parent's rather than stacking. */
  abilityIncreasesReplace: boolean;
  /** False for every 2014 row and every non-spell 2024 variant. */
  needsCastingAbility: boolean;
  /** Null/false for every row except the one carrying the matching trait. */
  chooseSkills: SpeciesSkillChoiceOption | null;
  chooseCantrip: SpeciesCantripChoiceOption | null;
  chooseOriginFeat: SpeciesOriginFeatChoiceOption;
}

/** Server-filtered by `?edition=`, never a client edition check. */
export interface SpeciesOption {
  id: string;
  name: string;
  slug: string;
  speed: number;
  /** [] for every EDITION_2024 row — 2024 ability increases come from backgrounds only, never species. */
  abilityIncreases: AbilityIncreaseSpec[];
  /** Always false — 2024 casting-ability choices are served on the variant, never the species itself; same signal as `SpeciesVariantOption.needsCastingAbility` at that level. */
  needsCastingAbility: boolean;
  /** Null/false for every row except the one carrying the matching trait. */
  chooseSkills: SpeciesSkillChoiceOption | null;
  chooseCantrip: SpeciesCantripChoiceOption | null;
  chooseOriginFeat: SpeciesOriginFeatChoiceOption;
  variants: SpeciesVariantOption[];
}

/** Served by GET /api/reference to populate the character-creation form. */
export interface ClassOption {
  id: string;
  name: string;
  hitDie: string;
  savingThrows: AbilityName[];
  skillChoiceCount: number;
  skillChoices: SkillName[];
  isSpellcaster: boolean;
  /** Already resolved for the requested edition; never compare a level against a raw catalog column. */
  subclassGateLevel: number;
  /** Available subclasses for this class, ordered alphabetically. */
  subclasses: SubclassOption[];
  /** Starting equipment definition, null if the class has no package defined. */
  startingEquipment: ClassStartingEquipment | null;
  /** PHB'14 p.163 — multiclass prerequisites are edition-invariant (also PHB'24). Any one of `options` satisfied against the character's scores counts as met. */
  multiclassPrerequisite: {
    options: Record<string, number>[];
    description: string;
  } | null;
  /** Fixed tool proficiencies always granted by this class. */
  toolProficiencies: string[];
  /** Tool names the player may choose from at creation. */
  toolChoices: string[];
  toolChoiceCount: number;
  /** `spellbookSize` is present, and equal to `spells`, only for the Wizard — `spells` there means spellbook size, not prepared count. */
  level1SpellPicks: { cantrips: number; spells: number; maxSpellLevel: number; spellbookSize?: number } | null;
  /** PHB'24 primary ability/abilities the creation panel recommends; [] for homebrew. */
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
  /** Independent pool/cap from `ClassOption.toolChoices`; edition-invariant, unlike `abilityChoices`/`originFeat` below. */
  toolChoices: string[];
  toolChoiceCount: number;
  /** The three abilities the +2/+1 (or 1/1/1) spread draws from; empty for spec-less legacy rows. */
  abilityChoices: AbilityName[];
  /** The Origin feat granted at creation; null for spec-less legacy rows. */
  originFeat: OriginFeatOption | null;
  /** Null when the background has no seeded package under this edition; same shape as `ClassOption.startingEquipment`, reused rather than a second type. */
  startingEquipment: ClassStartingEquipment | null;
}

/** One tool from the SRD TOOLS constant, served by GET /api/reference. */
export interface ToolOption {
  name: string;
  category: "artisan" | "gamingSet" | "musicalInstrument" | "other";
  cost?: { gp?: number; sp?: number; cp?: number };
  weight?: number;
}

/** `description` is that edition's actual rules text; no `rollEffects` — the client gets resolved `rollModifiers` elsewhere. */
export interface ConditionOption {
  key: ConditionKey;
  label: string;
  description: string;
}

/** `key` is edition-stable across the resolution; no `edition` field — which row won is an implementation detail. */
export interface UniversalActionOption {
  key: string;
  name: string;
  cost: ActionCost;
  description: string;
}

/** In ascending tier order; edition-invariant — the same six rows answer both editions. */
export interface ItemRarityOption {
  key: ItemRarity;
  label: string;
  /** Standard buy value in gp; null for priceless (Artifact). */
  standardValueGp: number | null;
}

/** Frontend holds no edition label/description table of its own; copy is served resolved. */
export interface EditionOption {
  key: RulesEdition;
  label: string;
  description: string;
}

/** `editions` is in display order; never re-derive `defaultEdition` from `editions[0]` — it's served explicitly to avoid that coupling. */
export interface EditionsResponse {
  defaultEdition: RulesEdition;
  editions: EditionOption[];
}

/** Edition-invariant (PHB'14 p.13 / SRD 5.2) — the same values validateAbilityScores enforces server-side; the create ceremony renders from this instead of owning its own copy. `costs` keys are ability scores 8-15 (JSON round-trips them as string keys). */
export interface AbilityGenerationConfig {
  standardArray: number[];
  pointBuy: { budget: number; floor: number; ceiling: number; costs: Record<number, number> };
  manual: { floor: number; ceiling: number };
}

export interface ReferenceData {
  /** The sole species catalog anchor — there is no separate flat `races` list. */
  species: SpeciesOption[];
  classes: ClassOption[];
  backgrounds: BackgroundOption[];
  alignments: string[];
  /** Artisan's tools for the sheet's Proficiencies-card dropdown. */
  artisanTools: ToolOption[];
  /** The 14 conditions' rules text, resolved for the requested edition. */
  conditions: ConditionOption[];
  /** Resolved for the requested edition, ordered by name. */
  universalActions: UniversalActionOption[];
  /** The six magic-item rarity tiers, ascending. */
  itemRarities: ItemRarityOption[];
  /** Standard array / point buy / manual-entry bounds for the ability-score step. */
  abilityGeneration: AbilityGenerationConfig;
}

// One selection per equipment choice group when mode:"package".
export interface PackageSelection {
  optionIndex: number;
  openPicks?: string[]; // catalog item names, in the bundle's openPick order
}

export type StartingEquipmentInput =
  | { mode: "package"; selections: PackageSelection[] }
  | { mode: "gold"; gold: number };

/** Backend derives AC/HP/saves/skills from this via `deriveCreatedCharacter` — the client never computes/sends them. */
export interface CreateCharacterInput {
  name: string;
  alignment: string;
  experiencePoints?: number;
  /** The sole mechanical anchor for species. */
  speciesId: string;
  variantId?: string;
  /** The CHOSEN portion only; fixed increases apply server-side with no request field — see `deriveSpeciesBonuses`. */
  speciesAbilities?: Partial<Record<AbilityName, number>>;
  /** Required iff the chosen species+variant's `needsCastingAbility` is true — see `deriveCastingAbilityChoice`. */
  castingAbility?: "intelligence" | "wisdom" | "charisma";
  /** Distinct from `skillProficiencies`/`spells` below (class/background pools) — see `deriveSpeciesSkillChoice`/`deriveSpeciesCantripChoice`. */
  speciesSkills?: SkillName[];
  speciesCantripId?: string;
  /** Sent only when the resolved species+variant carries `chooseOriginFeat` — see `deriveSpeciesOriginFeatChoice`. */
  speciesOriginFeatId?: string;
  background: string;
  classes: [{ name: string; subclass?: string | null; subclassId?: string }];
  abilityScores: AbilityScores;
  /** How `abilityScores` above was produced — the backend's validateAbilityScores checks it against the matching PHB rule; omitted falls back to a sanity-bound-only check (#1383's ability-score wave). */
  abilityGenerationMethod?: AbilityGenerationMethod;
  /** PHB'24 background ability spread (2+1 or 1+1+1 over `abilityChoices`); omitted for custom/spec-less backgrounds. */
  backgroundAbilities?: Partial<Record<AbilityName, number>>;
  skillProficiencies?: SkillName[];
  /** Tool names chosen by the player (from class toolChoices). */
  toolChoices?: string[];
  /** Tool names chosen from the BACKGROUND's own toolChoices pool — separate pick/cap from `toolChoices` above. */
  backgroundToolChoices?: string[];
  startingEquipment?: StartingEquipmentInput;
  /** The backend 400s a "gold" mode input here — a background never has a roll-for-gold alternative. */
  backgroundStartingEquipment?: StartingEquipmentInput;
  spells?: { cantripIds: string[]; spellIds: string[] };
  /** Resolved by `CreationEntryGate` before the ceremony starts; write-once. */
  rulesEdition?: RulesEdition;
}
