/**
 * Character-creation reference data (GET /api/reference) and the create-character body.
 */

import type { ClassStartingEquipment, RulesEdition } from "@character-sheet/shared-types";

import type { ActionCost } from "./actions";
import type { ConditionKey } from "./combat";
import type { ItemRarity } from "./inventory";
import type { AbilityName, AbilityScores, SkillName } from "./primitives";

// The starting-equipment shapes are the single cross-tier source of truth in
// shared-types (#1273); re-exported here so this module stays the frontend's
// reference-types entry point (flowing through the @/types/character barrel).
// ClassStartingEquipment is also used locally by ClassOption below.
export type { ClassStartingEquipment };
export type { EquipmentBundle, EquipmentChoiceGroup, OpenPick, StartingGold } from "@character-sheet/shared-types";

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

/** #1679/#1681: the AbilityIncreaseSpec vocabulary served on Species/SpeciesVariant
 *  rows (backend's abilityIncreasesSchema, lib/srd/species-ability-increases.ts) —
 *  a wire-shape mirror, not a rule: the backend alone decides what an ability
 *  bump is worth (resolveSpeciesGrants); the ceremony only reads this shape to
 *  render a preview and build the `speciesAbilities` request field. */
export type AbilityIncreaseSpec =
  | { ability: AbilityName; amount: number }
  | { choose: { count: number; amount: number; from?: AbilityName[] } }
  | { floating: number };

/** #1689: the species-granted creation-CHOICE vocabulary (SpeciesTrait.choice,
 *  backend's speciesTraitChoiceSchema) — a wire-shape mirror only, resolved
 *  server-side (never a client rule): `null` on both SpeciesOption and
 *  SpeciesVariantOption is the "no choice served" signal the ceremony panels
 *  key their own render-or-not off (the #1572 trick, no client edition logic).
 *  Half-Elf's own row carries chooseSkills; High Elf's own (variant) row
 *  carries chooseCantrip — present on BOTH levels here, mirroring
 *  abilityIncreases' own species-and-variant shape, so a future row that
 *  places either at the OTHER level (a variant-level chooseSkills, or a
 *  species-level chooseCantrip — neither exists yet) needs no wire-shape change. */
export interface SpeciesSkillChoiceOption {
  count: number;
  /** Omitted = any of the 18 skills is eligible (Half-Elf's shape). */
  from?: SkillName[];
}

export interface SpeciesCantripChoiceOption {
  /** Lowercase class name (matches Spell.classes' own case) — the list
   *  `GET /api/spells?className=` is queried with. */
  list: string;
  castingAbility: AbilityName;
}

/** A species' second creation step — 2014 subrace, 2024 lineage/legacy/
 *  ancestry (#1679/#1680), served nested inside SpeciesOption.variants: an
 *  empty variants array renders no variant step. Carries its own
 *  abilityIncreases (#1681), additive to the parent species'. */
export interface SpeciesVariantOption {
  id: string;
  name: string;
  slug: string;
  /** Additive to the parent species' own abilityIncreases at creation (Hill
   *  Dwarf's +1 WIS on top of Dwarf's +2 CON) — [] for every 2024 row. */
  abilityIncreases: AbilityIncreaseSpec[];
  /** #1683: true when picking this variant requires the Int/Wis/Cha
   *  casting-ability choice (a 2024 lineage/legacy that grants a spell —
   *  Elf's Drow/High Elf/Wood Elf, Gnome's Forest/Rock, Tiefling's Abyssal/
   *  Chthonic/Infernal). False for every 2014 row and every non-spell 2024
   *  variant (Dragonborn ancestry, Goliath's Giant Ancestry). */
  needsCastingAbility: boolean;
  /** #1689: null for every row but High Elf's own — see the type's own comment. */
  chooseSkills: SpeciesSkillChoiceOption | null;
  chooseCantrip: SpeciesCantripChoiceOption | null;
}

/** Species option (#1679/#1680), served nested per edition (server-filtered
 *  by `?edition=`, never a client edition check — the #1572 trick) with its
 *  variants nested inside, exactly like ClassOption.subclasses. An empty
 *  `variants` array is the signal the two-step picker renders one step, not
 *  two — e.g. 2014 Human vs. 2014 Dwarf (Hill/Mountain). */
export interface SpeciesOption {
  id: string;
  name: string;
  slug: string;
  speed: number;
  /** [] for every EDITION_2024 row — 2024 ability increases come from
   *  backgrounds only (#1572), never species (#1681). */
  abilityIncreases: AbilityIncreaseSpec[];
  /** #1683: same signal as SpeciesVariantOption.needsCastingAbility, at the
   *  species level (a grant with no variant chosen) — always false this
   *  wave, kept general for a future species-level grant. */
  needsCastingAbility: boolean;
  /** #1689: null for every row but Half-Elf's own — see the type's own comment. */
  chooseSkills: SpeciesSkillChoiceOption | null;
  chooseCantrip: SpeciesCantripChoiceOption | null;
  variants: SpeciesVariantOption[];
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
  /** Character level at which this class grants a subclass, ALREADY resolved
   *  for the requested edition by subclassGateLevel (#1325). Never compare a
   *  level against a raw catalog column. */
  subclassGateLevel: number;
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
  /** #1131/#1510: level-1 creation pick counts, resolved server-side for the
   *  requested edition (SRD 5.2 or SRD 5.1 per `?edition=`); null for a
   *  non-caster (or a class with no Spellcasting feature yet under this
   *  edition, e.g. a 2014 Paladin/Ranger). `spells: 0` is a real, edition-legal
   *  answer (a 2014 Cleric/Druid prepares from the full class list — there is
   *  no creation-time list to pick from). `maxSpellLevel` (#1377) is the
   *  highest level a creation pick may be, served so the picker sends it as
   *  `?maxLevel=` rather than a hardcoded 1; it is 0 for a cantrips-only step.
   *  `spellbookSize` (#1513): present, and equal to `spells`, ONLY for the
   *  Wizard — it marks that this class's creation pick count is a spellbook
   *  size, distinct from its (smaller) prepared cap, which is never served
   *  here — `creationLeveledPickCap` in `lib/creationSpells.ts` is the one
   *  place that reads it. Absent for every other class. */
  level1SpellPicks: { cantrips: number; spells: number; maxSpellLevel: number; spellbookSize?: number } | null;
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
  /** #1565: this background's own starting-equipment definition, null when
   *  the background has no seeded package under this edition — any 2014
   *  background but Acolyte (SRD 5.1's only one) and Folk Hero (PHB'14, #1570).
   *  Same shape as ClassOption.startingEquipment, reused rather than a second type. */
  startingEquipment: ClassStartingEquipment | null;
}

/** One tool from the SRD TOOLS constant, served by GET /api/reference. */
export interface ToolOption {
  name: string;
  category: "artisan" | "gamingSet" | "musicalInstrument" | "other";
  cost?: { gp?: number; sp?: number; cp?: number };
  weight?: number;
}

/** One of the 14 standard conditions, resolved for the requested edition
 *  (#1322) — description is that edition's actual rules text; no
 *  `rollEffects` (the client already gets resolved `rollModifiers`). */
export interface ConditionOption {
  key: ConditionKey;
  label: string;
  description: string;
}

/** One universal turn action, resolved for the requested edition (#1430) —
 *  `description` is that edition's actual rules text, and `key` is
 *  edition-stable (the 2024 "Magic" row keeps `key: "castSpell"`). No
 *  `edition`: which row won the resolution is an implementation detail. */
export interface UniversalActionOption {
  key: string;
  name: string;
  cost: ActionCost;
  description: string;
}

/** One of the six magic-item rarity tiers (#1437), in ascending tier order.
 *  Edition-invariant: the same six rows answer both editions. */
export interface ItemRarityOption {
  key: ItemRarity;
  label: string;
  /** Standard buy value in gp; null for priceless (Artifact). */
  standardValueGp: number | null;
}

/** One selectable rules edition, served by `GET /api/editions` (#1436) with its
 *  copy already resolved — the frontend holds no edition label/description table.
 *  `unavailableReason` present means visible but unselectable (#1371). */
export interface EditionOption {
  key: RulesEdition;
  label: string;
  description: string;
  unavailableReason?: string;
}

/** `GET /api/editions` (#1436). `editions` is in display order and `defaultEdition`
 *  is served explicitly: never re-derive it from `editions[0]` — that positional
 *  coupling is what this endpoint exists to delete. */
export interface EditionsResponse {
  defaultEdition: RulesEdition;
  editions: EditionOption[];
}

export interface ReferenceData {
  races: RaceOption[];
  /** Species catalog for the two-step species→variant picker (#1679/#1680),
   *  served alongside the flat `races` list above during its compat window
   *  (per-edition here supersedes the flat list; both pruned in #1684). */
  species: SpeciesOption[];
  classes: ClassOption[];
  backgrounds: BackgroundOption[];
  alignments: string[];
  /** Artisan's tools for the sheet's Proficiencies-card dropdown. */
  artisanTools: ToolOption[];
  /** The 14 conditions' rules text, resolved for the requested edition (#1322). */
  conditions: ConditionOption[];
  /** The universal turn actions, resolved for the requested edition and ordered
   *  by name (#1430). 15 rows for 2014, 17 for 2024 (Study + Influence). */
  universalActions: UniversalActionOption[];
  /** The six magic-item rarity tiers, ascending (#1437). */
  itemRarities: ItemRarityOption[];
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
  experiencePoints?: number;
  race: string;
  /** #1679/#1680: the two-step picker's real selection — ids, like
   *  `subclassId`. `race` above stays required alongside these (the display
   *  name POST /api/characters still needs until #1684 prunes the legacy path);
   *  the frontend no longer presents a race picker. */
  speciesId?: string;
  variantId?: string;
  /** 2014 species/subrace ability increases (#1681): the CHOSEN portion only
   *  (fixed increases apply server-side with no request field). Sent only
   *  when the merged species+variant spec has a choose component AND the
   *  player has completed it — see deriveSpeciesBonuses. */
  speciesAbilities?: Partial<Record<AbilityName, number>>;
  /** #1683: the 2024 lineage/legacy casting-ability choice (Int/Wis/Cha),
   *  required iff the chosen species+variant's needsCastingAbility is true —
   *  see deriveCastingAbilityChoice. */
  castingAbility?: "intelligence" | "wisdom" | "charisma";
  /** #1689: species-granted creation choices (SpeciesTrait.choice) —
   *  distinct from `skillProficiencies`/`spells` below, which are the
   *  class/background pools. Sent only when the resolved species+variant
   *  carries the matching choice-bearing trait AND the player has completed
   *  it — see deriveSpeciesSkillChoice/deriveSpeciesCantripChoice. */
  speciesSkills?: SkillName[];
  speciesCantripId?: string;
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
  /** #1565: the background's OWN equipment package selections, resolved by
   *  (backgroundId, edition) alongside `startingEquipment` above. A background
   *  never has a roll-for-gold alternative, so the backend 400s a "gold" mode
   *  input here; omitted for a background with no seeded package. */
  backgroundStartingEquipment?: StartingEquipmentInput;
  /** #1131: a level-1 caster's chosen cantrips + prepared spells (catalog ids). */
  spells?: { cantripIds: string[]; spellIds: string[] };
  /** #1286: resolved by CreationEntryGate before the ceremony starts — inherited
   *  from the chosen campaign, or explicitly picked for solo. Write-once. */
  rulesEdition?: RulesEdition;
}
