// Small SRD-derived rules tables + pure derivation helpers used by character
// creation. This is the backend's only home for this data — mirrors how
// src/lib/experience.ts is the only place the XP table lives. The frontend
// must not duplicate these tables; it gets the catalog data it needs (race
// speed, class hit die, etc.) from GET /api/reference and the 18-skill
// ability mapping from its own existing frontend/src/lib/abilities.ts
// SKILL_LABELS (display-only, no rules logic).

export const ALIGNMENTS: readonly string[] = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
];

export interface SkillDefinition {
  name: string;
  ability: string;
}

// All 18 5e skills with their governing ability — the canonical mapping
// implicit in prisma/seed.ts's per-character skill arrays.
export const SKILLS: readonly SkillDefinition[] = [
  { name: "acrobatics", ability: "dexterity" },
  { name: "animalHandling", ability: "wisdom" },
  { name: "arcana", ability: "intelligence" },
  { name: "athletics", ability: "strength" },
  { name: "deception", ability: "charisma" },
  { name: "history", ability: "intelligence" },
  { name: "insight", ability: "wisdom" },
  { name: "intimidation", ability: "charisma" },
  { name: "investigation", ability: "intelligence" },
  { name: "medicine", ability: "wisdom" },
  { name: "nature", ability: "intelligence" },
  { name: "perception", ability: "wisdom" },
  { name: "performance", ability: "charisma" },
  { name: "persuasion", ability: "charisma" },
  { name: "religion", ability: "intelligence" },
  { name: "sleightOfHand", ability: "dexterity" },
  { name: "stealth", ability: "dexterity" },
  { name: "survival", ability: "wisdom" },
];

// ── Spellcasting ability by class ────────────────────────────────────────────
// Maps a class name (lowercase) to the ability that governs its spellcasting.
// Used to derive spellSaveDC and spellAttackBonus at read time.
// Warlock is listed here for ability lookup but uses Pact Magic (short-rest,
// different slot counts) rather than the full-caster table — see
// deriveSpellcasting below.
export const SPELLCASTING_ABILITY: Readonly<Record<string, string>> = {
  wizard: "intelligence",
  sorcerer: "charisma",
  cleric: "wisdom",
  druid: "wisdom",
  bard: "charisma",
  warlock: "charisma",
  paladin: "charisma",
  ranger: "wisdom",
};

// Classes that use the standard full-caster progression below.
// Half/third casters and Warlock (Pact Magic) use different tables — they
// fall back to stored slot totals until a later phase adds their progressions.
const FULL_CASTER_CLASSES = new Set(["wizard", "sorcerer", "cleric", "druid", "bard"]);

// Standard 5e full-caster slot table (PHB p. 114 / Basic Rules spell table).
// Outer key: character level 1–20.  Inner key: slot level 1–9.
// Only non-zero slot counts are listed; missing slot levels have 0 slots.
export const FULL_CASTER_SLOTS: Readonly<Record<number, Readonly<Record<number, number>>>> = {
   1: { 1: 2 },
   2: { 1: 3 },
   3: { 1: 4, 2: 2 },
   4: { 1: 4, 2: 3 },
   5: { 1: 4, 2: 3, 3: 2 },
   6: { 1: 4, 2: 3, 3: 3 },
   7: { 1: 4, 2: 3, 3: 3, 4: 1 },
   8: { 1: 4, 2: 3, 3: 3, 4: 2 },
   9: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  10: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  11: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  12: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  13: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  14: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  15: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  16: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
  18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
  19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
  20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 },
};

export interface DerivedSpellcastingInfo {
  ability: string;
  spellSaveDC: number;
  spellAttackBonus: number;
  slotTotals: Array<{ level: number; total: number }>;
}

// Third-caster subclasses that grant spellcasting — Eldritch Knight and
// Arcane Trickster. Both use Intelligence and follow the same slot table.
// Keyed by lowercase subclass name.
const THIRD_CASTER_SUBCLASSES: Readonly<Record<string, string>> = {
  "eldritch knight": "intelligence",
  "arcane trickster": "intelligence",
};

// Third-caster slot table (PHB Fighter/Rogue spell slot table).
// Spellcasting starts at class level 3 (when the subclass is gained).
// Outer key: character level; inner key: spell slot level.
export const THIRD_CASTER_SLOTS: Readonly<Record<number, Readonly<Record<number, number>>>> = {
   3: { 1: 2 },
   4: { 1: 3 },
   5: { 1: 3 },
   6: { 1: 3 },
   7: { 1: 4, 2: 2 },
   8: { 1: 4, 2: 2 },
   9: { 1: 4, 2: 2 },
  10: { 1: 4, 2: 3 },
  11: { 1: 4, 2: 3 },
  12: { 1: 4, 2: 3 },
  13: { 1: 4, 2: 3, 3: 2 },
  14: { 1: 4, 2: 3, 3: 2 },
  15: { 1: 4, 2: 3, 3: 2 },
  16: { 1: 4, 2: 3, 3: 3 },
  17: { 1: 4, 2: 3, 3: 3 },
  18: { 1: 4, 2: 3, 3: 3 },
  19: { 1: 4, 2: 3, 3: 3, 4: 1 },
  20: { 1: 4, 2: 3, 3: 3, 4: 1 },
};

/**
 * Derives the mechanical spellcasting stats (ability, save DC, attack bonus,
 * slot totals) from a character's class, level, ability scores, and proficiency
 * bonus. Returns null for non-casters or unsupported progressions (half/third
 * casters, Warlock Pact Magic) — callers fall back to the stored blob.
 *
 * Pure function — no DB access, safe to call in serializeCharacter.
 *
 * @param subclass Optional subclass name — used to detect third-caster
 *   subclasses (Eldritch Knight / Arcane Trickster) which grant their own
 *   INT-based spellcasting.
 */
export function deriveSpellcasting(
  className: string,
  characterLevel: number,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
  subclass?: string,
): DerivedSpellcastingInfo | null {
  // Check third-caster subclasses first — they grant spellcasting independent
  // of the base class's caster status (Fighter/Rogue are not casters without them).
  const subclassKey = (subclass ?? "").toLowerCase();
  const thirdCasterAbility = THIRD_CASTER_SUBCLASSES[subclassKey];
  if (thirdCasterAbility) {
    if (characterLevel < 3) return null; // subclass (and its spellcasting) unlocked at level 3
    const abilityMod = abilityModifier(abilityScores[thirdCasterAbility] ?? 10);
    const spellSaveDC = 8 + proficiencyBonus + abilityMod;
    const spellAttackBonus = proficiencyBonus + abilityMod;
    const slotRow = THIRD_CASTER_SLOTS[Math.min(20, Math.max(3, characterLevel))] ?? {};
    const slotTotals = Object.entries(slotRow)
      .map(([lvl, total]) => ({ level: Number(lvl), total }))
      .sort((a, b) => a.level - b.level);
    return { ability: thirdCasterAbility, spellSaveDC, spellAttackBonus, slotTotals };
  }

  const classKey = className.toLowerCase();
  const ability = SPELLCASTING_ABILITY[classKey];
  if (!ability) return null; // non-caster class
  if (!FULL_CASTER_CLASSES.has(classKey)) return null; // TODO: Pact Magic / half-casters

  const abilityMod = abilityModifier(abilityScores[ability] ?? 10);
  const spellSaveDC = 8 + proficiencyBonus + abilityMod;
  const spellAttackBonus = proficiencyBonus + abilityMod;

  const slotRow = FULL_CASTER_SLOTS[Math.min(20, Math.max(1, characterLevel))] ?? {};
  const slotTotals = Object.entries(slotRow)
    .map(([lvl, total]) => ({ level: Number(lvl), total }))
    .sort((a, b) => a.level - b.level);

  return { ability, spellSaveDC, spellAttackBonus, slotTotals };
}

// ── Class features + trackable resources ──────────────────────────────────────
//
// `deriveResources` is the analog to `deriveSpellcasting` for non-slot resources:
// superiority dice, ki points, rages, etc. Like deriveSpellcasting it is pure
// (no DB) and called inside serializeCharacter. Only `used` counts and known
// lists persist; totals/die/recharge are derived here every read.

export type RechargeOn = "shortRest" | "longRest" | "short-or-long" | "none";

export interface DerivedResource {
  key: string;          // stable machine key, e.g. "superiorityDice"
  label: string;        // display label, e.g. "Superiority Dice"
  total: number;        // maximum count at this level
  die?: string;         // die size string, e.g. "d8" — absent for simple counters
  recharge: RechargeOn; // when the pool fully recharges
  description?: string;
}

export interface DerivedFeature {
  name: string;
  level: number;        // character level at which this feature is gained
  description: string;
  source: "class" | "subclass";
}

export interface DerivedClassInfo {
  resources: DerivedResource[];
  features: DerivedFeature[];
  /** Battle Master only: number of maneuvers the character may know at this level. */
  maneuverChoiceCount?: number;
  /** Battle Master only: save DC for maneuver effects (8 + prof + Str/Dex mod). */
  maneuverSaveDC?: number;
}

// ── Battle Master rules data ──────────────────────────────────────────────────
// All subclass-specific rules tables live in this file — same reasoning as
// ALIGNMENTS, SKILLS, and FULL_CASTER_SLOTS: the only permitted home for 5e
// rules data in the backend (see CLAUDE.md).

/** Superiority dice count by Fighter level (Battle Master). */
function battleMasterDiceCount(level: number): number {
  if (level >= 15) return 6;
  if (level >= 7) return 5;
  return 4;
}

/** Superiority die size by Fighter level (Battle Master). */
function battleMasterDieFace(level: number): string {
  if (level >= 18) return "d12";
  if (level >= 10) return "d10";
  return "d8";
}

/** Maneuver choice count by Fighter level (Battle Master). */
function battleMasterManeuverCount(level: number): number {
  if (level >= 15) return 9;
  if (level >= 10) return 7;
  if (level >= 7) return 5;
  return 3;
}

const BATTLE_MASTER_FEATURES: DerivedFeature[] = [
  {
    name: "Combat Superiority",
    level: 3,
    source: "subclass",
    description:
      "You learn maneuvers fueled by superiority dice (d8s). You have 4 dice and regain all expended dice on a short or long rest. Maneuvers can only be used once per attack unless otherwise stated.",
  },
  {
    name: "Student of War",
    level: 3,
    source: "subclass",
    description:
      "You gain proficiency with one type of artisan's tools of your choice.",
  },
  {
    name: "Know Your Enemy",
    level: 7,
    source: "subclass",
    description:
      "If you spend at least 1 minute observing or interacting with another creature outside combat, you can compare two of its ability scores, armor class, hit points, hit dice, or levels to your own.",
  },
  {
    name: "Improved Combat Superiority (d10)",
    level: 10,
    source: "subclass",
    description: "Your superiority dice turn into d10s.",
  },
  {
    name: "Relentless",
    level: 15,
    source: "subclass",
    description:
      "When you roll initiative and have no superiority dice remaining, you regain 1 superiority die.",
  },
  {
    name: "Improved Combat Superiority (d12)",
    level: 18,
    source: "subclass",
    description: "Your superiority dice turn into d12s.",
  },
];

// ── Subclass dispatch tables ──────────────────────────────────────────────────
// Add new subclasses here as resources and features are implemented.
// Keys are lowercase subclass names (matching entry.subclass.toLowerCase()).

// The class level at which each subclass first grants its trackable resources
// (mirrors CharacterClass.subclassLevel in the DB; default 3 = schema default).
// Keep in sync when adding new subclasses.
const SUBCLASS_GRANT_LEVEL: Record<string, number> = {
  "battle master": 3,
};

const SUBCLASS_RESOURCE_FN: Record<
  string,
  (level: number, abilityScores: Record<string, number>, profBonus: number) => DerivedResource[]
> = {
  "battle master": (level, abilityScores, profBonus) => {
    const count = battleMasterDiceCount(level);
    const die = battleMasterDieFace(level);
    const strMod = abilityModifier(abilityScores.strength ?? 10);
    const dexMod = abilityModifier(abilityScores.dexterity ?? 10);
    const mightMod = Math.max(strMod, dexMod);
    const saveDC = 8 + profBonus + mightMod;
    return [
      {
        key: "superiorityDice",
        label: "Superiority Dice",
        total: count,
        die,
        recharge: "short-or-long",
        description: `Spend to fuel maneuvers. Maneuver save DC ${saveDC}. Regain all on a short or long rest.`,
      },
    ];
  },
};

const SUBCLASS_FEATURE_LIST: Record<string, DerivedFeature[]> = {
  "battle master": BATTLE_MASTER_FEATURES,
};

/**
 * Derives the trackable resources (pools with totals/die/recharge) and static
 * feature descriptions for a character's subclass. Returns null when no rules
 * exist for the given subclass — callers should render nothing.
 *
 * Pure function — no DB access, safe to call in serializeCharacter.
 * Takes abilityScores and profBonus for forward-compat (maneuver save DCs,
 * ki save DCs, etc.) even when the pool itself doesn't need them.
 */
export function deriveResources(
  _className: string,
  subclass: string | undefined,
  level: number,
  abilityScores: Record<string, number>,
  profBonus: number,
): DerivedClassInfo | null {
  const subclassKey = (subclass ?? "").toLowerCase();
  if (!subclassKey) return null;

  const resourceFn = SUBCLASS_RESOURCE_FN[subclassKey];
  const featureList = SUBCLASS_FEATURE_LIST[subclassKey];

  if (!resourceFn && !featureList) return null;

  // Guard: don't surface resources or features until the character has reached
  // the level at which the subclass is granted (e.g. Battle Master = 3).
  // This defends both serializeCharacter and the spend endpoint against stale
  // subclass names left on the class entry below the granting level.
  if (level < (SUBCLASS_GRANT_LEVEL[subclassKey] ?? 3)) return null;

  const resources = resourceFn ? resourceFn(level, abilityScores, profBonus) : [];
  // Only surface features that have been gained (level >= feature.level).
  const features = (featureList ?? []).filter((f) => f.level <= level);

  const result: DerivedClassInfo = { resources, features };

  if (subclassKey === "battle master" && level >= 3) {
    result.maneuverChoiceCount = battleMasterManeuverCount(level);
    const strMod = abilityModifier(abilityScores.strength ?? 10);
    const dexMod = abilityModifier(abilityScores.dexterity ?? 10);
    result.maneuverSaveDC = 8 + profBonus + Math.max(strMod, dexMod);
  }

  return result;
}

/** Standard 5e modifier: floor((score - 10) / 2). */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Parses a hit die string like "d8" into its face value (8). */
export function hitDieFace(hitDie: string): number {
  return Number(hitDie.replace(/^d/i, ""));
}

export interface DeriveCharacterInput {
  abilityScores: Record<string, number>;
  skillProficiencies: string[];
}

export interface DeriveCharacterCatalog {
  race: { speed: number };
  characterClass: { hitDie: string; savingThrows: string[] };
}

export interface DerivedCharacterFields {
  speed: number;
  hitDice: { total: number; die: string; spent: number };
  hitPoints: { current: number; max: number; temp: number; deathSaves: { successes: number; failures: number } };
  armorClass: number;
  initiativeBonus: number;
  savingThrowProficiencies: string[];
  skills: { name: string; ability: string; proficient: boolean }[];
  currency: { cp: number; sp: number; gp: number; pp: number };
  spellcasting: null;
  journal: never[];
}

// ---------------------------------------------------------------------------
// Starting equipment — per-class packages (2014 Basic Rules)
//
// These are rules data, so they live here (same reasoning as ALIGNMENTS and
// the XP table in experience.ts). The frontend gets these via
// GET /api/reference (reference.ts attaches them to each class row) and
// never needs to duplicate them.
// ---------------------------------------------------------------------------

export type WeaponClassName = "simple" | "martial";
export type WeaponRangeName = "melee" | "ranged";

/** Filter used for open picks — omitting a field means "any". */
export interface WeaponPoolFilter {
  weaponClass?: WeaponClassName;
  range?: WeaponRangeName;
}

/** Reference to a concrete catalog Item by its unique name, with a quantity. */
export interface FixedItemRef {
  catalogName: string;
  quantity?: number; // default 1
}

/** An open pick from the weapon pool, e.g. "any martial weapon". */
export interface OpenWeaponPick {
  label: string;
  filter: WeaponPoolFilter;
  quantity?: number; // default 1
}

/**
 * One selectable bundle within a choice group — a set of fixed items plus
 * zero or more open picks the player fills in from the filtered catalog.
 */
export interface EquipmentBundle {
  label: string;
  items?: FixedItemRef[];
  openPicks?: OpenWeaponPick[];
}

/**
 * A choice group within a class's starting equipment.
 * options.length === 1 → auto-granted (no player choice needed).
 * options.length > 1  → player picks exactly one bundle.
 */
export interface EquipmentChoiceGroup {
  label: string;
  options: EquipmentBundle[];
}

/** Dice expression for starting gold: roll diceCount×dFaces, multiply. */
export interface StartingGold {
  diceCount: number;
  diceFaces: number;
  multiplier: number;
}

export interface ClassStartingEquipment {
  groups: EquipmentChoiceGroup[];
  gold: StartingGold;
}

export const STARTING_EQUIPMENT: Record<string, ClassStartingEquipment> = {
  Fighter: {
    gold: { diceCount: 5, diceFaces: 4, multiplier: 10 },
    groups: [
      {
        label: "(a) chain mail or (b) leather armor, longbow, and 20 arrows",
        options: [
          { label: "Chain Mail", items: [{ catalogName: "Chain Mail" }] },
          {
            label: "Leather Armor, Longbow, and 20 Arrows",
            items: [
              { catalogName: "Leather Armor" },
              { catalogName: "Longbow" },
              { catalogName: "Arrows", quantity: 20 },
            ],
          },
        ],
      },
      {
        label: "(a) a martial weapon and a shield or (b) two martial weapons",
        options: [
          {
            label: "A martial weapon and a shield",
            items: [{ catalogName: "Shield" }],
            openPicks: [{ label: "any martial weapon", filter: { weaponClass: "martial" } }],
          },
          {
            label: "Two martial weapons",
            openPicks: [
              { label: "first martial weapon", filter: { weaponClass: "martial" } },
              { label: "second martial weapon", filter: { weaponClass: "martial" } },
            ],
          },
        ],
      },
      {
        label: "(a) a light crossbow and 20 bolts or (b) two handaxes",
        options: [
          {
            label: "Light Crossbow and 20 Bolts",
            items: [{ catalogName: "Light Crossbow" }, { catalogName: "Crossbow Bolts", quantity: 20 }],
          },
          { label: "Two Handaxes", items: [{ catalogName: "Handaxe", quantity: 2 }] },
        ],
      },
      {
        label: "(a) a dungeoneer's pack or (b) an explorer's pack",
        options: [
          { label: "Dungeoneer's Pack", items: [{ catalogName: "Dungeoneer's Pack" }] },
          { label: "Explorer's Pack", items: [{ catalogName: "Explorer's Pack" }] },
        ],
      },
    ],
  },

  Wizard: {
    gold: { diceCount: 4, diceFaces: 4, multiplier: 10 },
    groups: [
      {
        label: "(a) a quarterstaff or (b) a dagger",
        options: [
          { label: "Quarterstaff", items: [{ catalogName: "Quarterstaff" }] },
          { label: "Dagger", items: [{ catalogName: "Dagger" }] },
        ],
      },
      {
        label: "(a) a component pouch or (b) an arcane focus",
        options: [
          { label: "Component Pouch", items: [{ catalogName: "Component Pouch" }] },
          { label: "Arcane Focus (Pearl)", items: [{ catalogName: "Pearl (arcane focus)" }] },
        ],
      },
      {
        label: "(a) a scholar's pack or (b) an explorer's pack",
        options: [
          { label: "Scholar's Pack", items: [{ catalogName: "Scholar's Pack" }] },
          { label: "Explorer's Pack", items: [{ catalogName: "Explorer's Pack" }] },
        ],
      },
      {
        // Auto-granted — no choice
        label: "A spellbook",
        options: [{ label: "Spellbook", items: [{ catalogName: "Spellbook" }] }],
      },
    ],
  },

  Rogue: {
    gold: { diceCount: 4, diceFaces: 4, multiplier: 10 },
    groups: [
      {
        label: "(a) a rapier or (b) a shortsword",
        options: [
          { label: "Rapier", items: [{ catalogName: "Rapier" }] },
          { label: "Shortsword", items: [{ catalogName: "Shortsword" }] },
        ],
      },
      {
        label: "(a) a shortbow and quiver of 20 arrows or (b) a shortsword",
        options: [
          {
            label: "Shortbow and 20 Arrows",
            items: [{ catalogName: "Shortbow" }, { catalogName: "Arrows", quantity: 20 }],
          },
          { label: "Shortsword", items: [{ catalogName: "Shortsword" }] },
        ],
      },
      {
        label: "(a) a burglar's pack, (b) dungeoneer's pack, or (c) explorer's pack",
        options: [
          { label: "Burglar's Pack", items: [{ catalogName: "Burglar's Pack" }] },
          { label: "Dungeoneer's Pack", items: [{ catalogName: "Dungeoneer's Pack" }] },
          { label: "Explorer's Pack", items: [{ catalogName: "Explorer's Pack" }] },
        ],
      },
      {
        // Auto-granted
        label: "Leather armor, two daggers, and thieves' tools",
        options: [
          {
            label: "Leather Armor, Two Daggers, Thieves' Tools",
            items: [
              { catalogName: "Leather Armor" },
              { catalogName: "Dagger", quantity: 2 },
              { catalogName: "Thieves' Tools" },
            ],
          },
        ],
      },
    ],
  },

  Cleric: {
    gold: { diceCount: 5, diceFaces: 4, multiplier: 10 },
    groups: [
      {
        label: "(a) a mace or (b) a warhammer (if proficient)",
        options: [
          { label: "Mace", items: [{ catalogName: "Mace" }] },
          { label: "Warhammer", items: [{ catalogName: "Warhammer" }] },
        ],
      },
      {
        label: "(a) scale mail, (b) leather armor, or (c) chain mail (if proficient)",
        options: [
          { label: "Scale Mail", items: [{ catalogName: "Scale Mail" }] },
          { label: "Leather Armor", items: [{ catalogName: "Leather Armor" }] },
          { label: "Chain Mail", items: [{ catalogName: "Chain Mail" }] },
        ],
      },
      {
        label: "(a) a light crossbow and 20 bolts or (b) any simple weapon",
        options: [
          {
            label: "Light Crossbow and 20 Bolts",
            items: [{ catalogName: "Light Crossbow" }, { catalogName: "Crossbow Bolts", quantity: 20 }],
          },
          {
            label: "Any simple weapon",
            openPicks: [{ label: "any simple weapon", filter: { weaponClass: "simple" } }],
          },
        ],
      },
      {
        label: "(a) a priest's pack or (b) an explorer's pack",
        options: [
          { label: "Priest's Pack", items: [{ catalogName: "Priest's Pack" }] },
          { label: "Explorer's Pack", items: [{ catalogName: "Explorer's Pack" }] },
        ],
      },
      {
        // Auto-granted
        label: "A shield and a holy symbol",
        options: [
          {
            label: "Shield and Holy Symbol",
            items: [{ catalogName: "Shield" }, { catalogName: "Holy Symbol" }],
          },
        ],
      },
    ],
  },

  Barbarian: {
    gold: { diceCount: 2, diceFaces: 4, multiplier: 10 },
    groups: [
      {
        label: "(a) a greataxe or (b) any martial melee weapon",
        options: [
          { label: "Greataxe", items: [{ catalogName: "Greataxe" }] },
          {
            label: "Any martial melee weapon",
            openPicks: [{ label: "any martial melee weapon", filter: { weaponClass: "martial", range: "melee" } }],
          },
        ],
      },
      {
        label: "(a) two handaxes or (b) any simple weapon",
        options: [
          { label: "Two Handaxes", items: [{ catalogName: "Handaxe", quantity: 2 }] },
          {
            label: "Any simple weapon",
            openPicks: [{ label: "any simple weapon", filter: { weaponClass: "simple" } }],
          },
        ],
      },
      {
        // Auto-granted
        label: "An explorer's pack and four javelins",
        options: [
          {
            label: "Explorer's Pack and 4 Javelins",
            items: [{ catalogName: "Explorer's Pack" }, { catalogName: "Javelin", quantity: 4 }],
          },
        ],
      },
    ],
  },

  Bard: {
    gold: { diceCount: 5, diceFaces: 4, multiplier: 10 },
    groups: [
      {
        label: "(a) a rapier, (b) a longsword, or (c) any simple weapon",
        options: [
          { label: "Rapier", items: [{ catalogName: "Rapier" }] },
          { label: "Longsword", items: [{ catalogName: "Longsword" }] },
          {
            label: "Any simple weapon",
            openPicks: [{ label: "any simple weapon", filter: { weaponClass: "simple" } }],
          },
        ],
      },
      {
        label: "(a) a diplomat's pack or (b) an entertainer's pack",
        options: [
          { label: "Diplomat's Pack", items: [{ catalogName: "Diplomat's Pack" }] },
          { label: "Entertainer's Pack", items: [{ catalogName: "Entertainer's Pack" }] },
        ],
      },
      {
        label: "(a) a lute or (b) any other musical instrument",
        options: [
          { label: "Lute", items: [{ catalogName: "Lute" }] },
          {
            // Treat as a free open instrument pick — modeled as a simple gear
            // item; the filter here is permissive (any gear, by instrument tag)
            // but since the catalog only has one instrument we just offer it.
            label: "Lute (only instrument in catalog)",
            items: [{ catalogName: "Lute" }],
          },
        ],
      },
      {
        // Auto-granted
        label: "Leather armor and a dagger",
        options: [
          {
            label: "Leather Armor and Dagger",
            items: [{ catalogName: "Leather Armor" }, { catalogName: "Dagger" }],
          },
        ],
      },
    ],
  },
};

/**
 * Each pack name maps to the individual catalog-item rows it expands into
 * when chosen as starting equipment (per the 2014 Basic Rules equipment packs
 * section). Packs still exist as single "gear" catalog Items too — this map
 * is only consulted by the starting-equipment resolver.
 */
export const PACK_CONTENTS: Record<string, FixedItemRef[]> = {
  "Dungeoneer's Pack": [
    { catalogName: "Backpack" },
    { catalogName: "Crowbar" },
    { catalogName: "Hammer" },
    { catalogName: "Piton", quantity: 10 },
    { catalogName: "Torch", quantity: 10 },
    { catalogName: "Tinderbox" },
    { catalogName: "Rations", quantity: 10 },
    { catalogName: "Waterskin" },
    { catalogName: "Hempen Rope (50 ft)" },
  ],
  "Explorer's Pack": [
    { catalogName: "Backpack" },
    { catalogName: "Bedroll" },
    { catalogName: "Mess Kit" },
    { catalogName: "Tinderbox" },
    { catalogName: "Torch", quantity: 10 },
    { catalogName: "Rations", quantity: 10 },
    { catalogName: "Waterskin" },
    { catalogName: "Hempen Rope (50 ft)" },
  ],
  "Burglar's Pack": [
    { catalogName: "Backpack" },
    { catalogName: "Ball Bearings", quantity: 1000 },
    { catalogName: "String (10 ft)" },
    { catalogName: "Bell" },
    { catalogName: "Candle", quantity: 5 },
    { catalogName: "Crowbar" },
    { catalogName: "Hammer" },
    { catalogName: "Piton", quantity: 10 },
    { catalogName: "Hooded Lantern" },
    { catalogName: "Oil Flask", quantity: 2 },
    { catalogName: "Rations", quantity: 5 },
    { catalogName: "Tinderbox" },
    { catalogName: "Waterskin" },
    { catalogName: "Hempen Rope (50 ft)" },
  ],
  "Priest's Pack": [
    { catalogName: "Backpack" },
    { catalogName: "Blanket" },
    { catalogName: "Candle", quantity: 10 },
    { catalogName: "Tinderbox" },
    { catalogName: "Alms Box" },
    { catalogName: "Incense Block", quantity: 2 },
    { catalogName: "Censer" },
    { catalogName: "Vestments" },
    { catalogName: "Rations", quantity: 2 },
    { catalogName: "Waterskin" },
  ],
  "Diplomat's Pack": [
    { catalogName: "Chest" },
    { catalogName: "Map Case", quantity: 2 },
    { catalogName: "Fine Clothes" },
    { catalogName: "Ink and Quill" },
    { catalogName: "Lamp" },
    { catalogName: "Oil Flask", quantity: 2 },
    { catalogName: "Paper Sheet", quantity: 5 },
    { catalogName: "Perfume Vial" },
    { catalogName: "Sealing Wax" },
    { catalogName: "Soap" },
  ],
  "Entertainer's Pack": [
    { catalogName: "Backpack" },
    { catalogName: "Bedroll" },
    { catalogName: "Costume Clothes", quantity: 2 },
    { catalogName: "Candle", quantity: 5 },
    { catalogName: "Rations", quantity: 5 },
    { catalogName: "Waterskin" },
    { catalogName: "Disguise Kit" },
  ],
  "Scholar's Pack": [
    { catalogName: "Backpack" },
    { catalogName: "Book of Lore" },
    { catalogName: "Ink and Quill" },
    { catalogName: "Parchment Sheet", quantity: 10 },
    { catalogName: "Tinderbox" },
    { catalogName: "Knife" },
  ],
};

/**
 * Derives a newly-created level-1 character's mechanical fields from the
 * player's choices (ability scores, chosen skill proficiencies) plus the
 * resolved race/class catalog rows. Pure function — no DB access.
 */
export function deriveCreatedCharacter(
  input: DeriveCharacterInput,
  catalog: DeriveCharacterCatalog
): DerivedCharacterFields {
  const constitutionModifier = abilityModifier(input.abilityScores.constitution);
  const dexterityModifier = abilityModifier(input.abilityScores.dexterity);
  const maxHitPoints = Math.max(1, hitDieFace(catalog.characterClass.hitDie) + constitutionModifier);

  return {
    speed: catalog.race.speed,
    hitDice: { total: 1, die: catalog.characterClass.hitDie, spent: 0 },
    hitPoints: { current: maxHitPoints, max: maxHitPoints, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    armorClass: 10 + dexterityModifier,
    initiativeBonus: dexterityModifier,
    savingThrowProficiencies: catalog.characterClass.savingThrows,
    skills: SKILLS.map(({ name, ability }) => ({
      name,
      ability,
      proficient: input.skillProficiencies.includes(name),
    })),
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
    spellcasting: null,
    journal: [],
  };
}
