// Small SRD-derived rules tables + pure derivation helpers used by character
// creation. This is the backend's only home for this data — mirrors how
// src/lib/experience.ts is the only place the XP table lives. The frontend
// must not duplicate these tables; it gets the catalog data it needs (race
// speed, class hit die, etc.) from GET /api/reference and the 18-skill
// ability mapping from its own existing frontend/src/lib/abilities.ts
// SKILL_LABELS (display-only, no rules logic).

import type { AdvancementEntry } from "./resources.js";

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

// ── Tools ─────────────────────────────────────────────────────────────────────
// Full SRD tool list. Used to validate tool-proficiency choices at creation,
// for the Student of War artisan-tool picker, and in GET /api/reference.
// Tool proficiency in 5e adds proficiency bonus to ability checks — the
// governing ability is chosen per check by the DM, not fixed per tool.

export type ToolCategory = "artisan" | "gamingSet" | "musicalInstrument" | "other";

export interface ToolDefinition {
  name: string;
  category: ToolCategory;
  cost?: { gp?: number; sp?: number; cp?: number };
  weight?: number; // lbs
}

export const TOOLS: readonly ToolDefinition[] = [
  // Artisan's tools (PHB p. 154)
  { name: "Alchemist's Supplies",    category: "artisan",          cost: { gp: 50 },  weight: 8  },
  { name: "Brewer's Supplies",       category: "artisan",          cost: { gp: 20 },  weight: 9  },
  { name: "Calligrapher's Supplies", category: "artisan",          cost: { gp: 10 },  weight: 5  },
  { name: "Carpenter's Tools",       category: "artisan",          cost: { gp: 8  },  weight: 6  },
  { name: "Cartographer's Tools",    category: "artisan",          cost: { gp: 15 },  weight: 6  },
  { name: "Cobbler's Tools",         category: "artisan",          cost: { gp: 5  },  weight: 5  },
  { name: "Cook's Utensils",         category: "artisan",          cost: { gp: 1  },  weight: 8  },
  { name: "Glassblower's Tools",     category: "artisan",          cost: { gp: 30 },  weight: 5  },
  { name: "Jeweler's Tools",         category: "artisan",          cost: { gp: 25 },  weight: 2  },
  { name: "Leatherworker's Tools",   category: "artisan",          cost: { gp: 5  },  weight: 5  },
  { name: "Mason's Tools",           category: "artisan",          cost: { gp: 10 },  weight: 8  },
  { name: "Painter's Supplies",      category: "artisan",          cost: { gp: 10 },  weight: 5  },
  { name: "Potter's Tools",          category: "artisan",          cost: { gp: 10 },  weight: 3  },
  { name: "Smith's Tools",           category: "artisan",          cost: { gp: 20 },  weight: 8  },
  { name: "Tinker's Tools",          category: "artisan",          cost: { gp: 50 },  weight: 10 },
  { name: "Weaver's Tools",          category: "artisan",          cost: { gp: 1  },  weight: 5  },
  { name: "Woodcarver's Tools",      category: "artisan",          cost: { gp: 1  },  weight: 5  },
  // Gaming sets
  { name: "Dice Set",                category: "gamingSet",        cost: { sp: 1  },  weight: 0  },
  { name: "Playing Card Set",        category: "gamingSet",        cost: { sp: 5  },  weight: 0  },
  // Musical instruments (PHB p. 154)
  { name: "Bagpipes",                category: "musicalInstrument", cost: { gp: 30 }, weight: 6  },
  { name: "Drum",                    category: "musicalInstrument", cost: { gp: 6  }, weight: 3  },
  { name: "Dulcimer",                category: "musicalInstrument", cost: { gp: 25 }, weight: 10 },
  { name: "Flute",                   category: "musicalInstrument", cost: { gp: 2  }, weight: 1  },
  { name: "Lute",                    category: "musicalInstrument", cost: { gp: 35 }, weight: 2  },
  { name: "Lyre",                    category: "musicalInstrument", cost: { gp: 30 }, weight: 2  },
  { name: "Horn",                    category: "musicalInstrument", cost: { gp: 3  }, weight: 2  },
  { name: "Pan Flute",               category: "musicalInstrument", cost: { gp: 12 }, weight: 2  },
  { name: "Shawm",                   category: "musicalInstrument", cost: { gp: 2  }, weight: 1  },
  { name: "Viol",                    category: "musicalInstrument", cost: { gp: 30 }, weight: 1  },
  // Other tools
  { name: "Disguise Kit",            category: "other",            cost: { gp: 25 },  weight: 3  },
  { name: "Forgery Kit",             category: "other",            cost: { gp: 15 },  weight: 5  },
  { name: "Herbalism Kit",           category: "other",            cost: { gp: 5  },  weight: 3  },
  { name: "Navigator's Tools",       category: "other",            cost: { gp: 25 },  weight: 2  },
  { name: "Poisoner's Kit",          category: "other",            cost: { gp: 50 },  weight: 2  },
  { name: "Thieves' Tools",          category: "other",            cost: { gp: 25 },  weight: 1  },
];

/** Returns tools filtered by category. */
export function toolsByCategory(category: ToolCategory): readonly ToolDefinition[] {
  return TOOLS.filter((t) => t.category === category);
}

/** Returns true if `name` is a known tool name (case-sensitive). */
export function isKnownTool(name: string): boolean {
  return TOOLS.some((t) => t.name === name);
}

// ── Conditions ────────────────────────────────────────────────────────────────
// The 14 standard 5e status conditions (PHB Appendix A). This is the single
// source of truth for condition rules data — the frontend resolves display text
// through a label map derived from these keys, never by rendering raw keys.
// Exhaustion is intentionally NOT in this list: it is a single 0–6 level handled
// as a special case (see EXHAUSTION_MAX / exhaustionEffect below), not a boolean
// presence in the active-conditions list.

export type ConditionKey =
  | "blinded"
  | "charmed"
  | "deafened"
  | "frightened"
  | "grappled"
  | "incapacitated"
  | "invisible"
  | "paralyzed"
  | "petrified"
  | "poisoned"
  | "prone"
  | "restrained"
  | "stunned"
  | "unconscious";

export interface ConditionDefinition {
  key: ConditionKey;
  label: string;
  description: string;
}

export const CONDITIONS: readonly ConditionDefinition[] = [
  {
    key: "blinded",
    label: "Blinded",
    description:
      "Can't see and automatically fails any ability check that requires sight. Attack rolls against the creature have advantage, and its attack rolls have disadvantage.",
  },
  {
    key: "charmed",
    label: "Charmed",
    description:
      "Can't attack the charmer or target it with harmful abilities or magical effects. The charmer has advantage on ability checks to interact socially with the creature.",
  },
  {
    key: "deafened",
    label: "Deafened",
    description: "Can't hear and automatically fails any ability check that requires hearing.",
  },
  {
    key: "frightened",
    label: "Frightened",
    description:
      "Has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight. Can't willingly move closer to the source of its fear.",
  },
  {
    key: "grappled",
    label: "Grappled",
    description:
      "Speed becomes 0, and it can't benefit from any bonus to its speed. The condition ends if the grappler is incapacitated or if the creature is moved out of reach.",
  },
  {
    key: "incapacitated",
    label: "Incapacitated",
    description: "Can't take actions or reactions.",
  },
  {
    key: "invisible",
    label: "Invisible",
    description:
      "Impossible to see without the aid of magic or a special sense. The creature is heavily obscured. Attack rolls against it have disadvantage, and its attack rolls have advantage.",
  },
  {
    key: "paralyzed",
    label: "Paralyzed",
    description:
      "Incapacitated and can't move or speak. Automatically fails Strength and Dexterity saving throws. Attack rolls against it have advantage, and any attack that hits from within 5 feet is a critical hit.",
  },
  {
    key: "petrified",
    label: "Petrified",
    description:
      "Transformed, along with nonmagical objects it is wearing or carrying, into a solid inanimate substance. Incapacitated, can't move or speak, and is unaware of its surroundings. Resistant to all damage; immune to poison and disease.",
  },
  {
    key: "poisoned",
    label: "Poisoned",
    description: "Has disadvantage on attack rolls and ability checks.",
  },
  {
    key: "prone",
    label: "Prone",
    description:
      "Can only crawl unless it stands up. Has disadvantage on attack rolls. An attack roll against it has advantage if the attacker is within 5 feet; otherwise the attack roll has disadvantage.",
  },
  {
    key: "restrained",
    label: "Restrained",
    description:
      "Speed becomes 0, and it can't benefit from any bonus to its speed. Attack rolls against it have advantage, and its attack rolls have disadvantage. Has disadvantage on Dexterity saving throws.",
  },
  {
    key: "stunned",
    label: "Stunned",
    description:
      "Incapacitated, can't move, and can speak only falteringly. Automatically fails Strength and Dexterity saving throws. Attack rolls against it have advantage.",
  },
  {
    key: "unconscious",
    label: "Unconscious",
    description:
      "Incapacitated, can't move or speak, and is unaware of its surroundings. Drops whatever it's holding and falls prone. Automatically fails Strength and Dexterity saving throws. Attack rolls against it have advantage, and any attack that hits from within 5 feet is a critical hit.",
  },
];

/** Maximum exhaustion level (level 6 = death). */
export const EXHAUSTION_MAX = 6;

/**
 * Cumulative effect text for each exhaustion level (1–6, PHB p. 291). Effects
 * are cumulative: a creature at level N suffers the effects of all lower levels.
 * Index 0 is the "no exhaustion" case.
 */
export const EXHAUSTION_EFFECTS: readonly string[] = [
  "No exhaustion.",
  "Disadvantage on ability checks.",
  "Speed halved.",
  "Disadvantage on attack rolls and saving throws.",
  "Hit point maximum halved.",
  "Speed reduced to 0.",
  "Death.",
];

/** Returns true if `key` is a known standard condition key. */
export function isKnownCondition(key: string): key is ConditionKey {
  return CONDITIONS.some((c) => c.key === key);
}

/** Cumulative effect text for an exhaustion level, clamped to 0–6. */
export function exhaustionEffect(level: number): string {
  const clamped = Math.min(EXHAUSTION_MAX, Math.max(0, Math.trunc(level)));
  return EXHAUSTION_EFFECTS[clamped];
}

// ── Fighting Styles ───────────────────────────────────────────────────────────
// Selectable class-feature choice gained by a Fighter at level 1 (and other
// martial classes later — Paladin/Ranger out of scope for now). The CHOSEN
// style key is the only thing persisted (Character.resources.fightingStyle);
// its mechanical effects are derived at read time, never stored. The frontend
// resolves display text through a label map keyed off these entries — never by
// rendering a raw style key. Mirrors the CONDITIONS data block + isKnownCondition
// guard above.

export type FightingStyleKey =
  | "archery"
  | "defense"
  | "dueling"
  | "greatWeaponFighting"
  | "protection"
  | "twoWeaponFighting";

export interface FightingStyleDefinition {
  key: FightingStyleKey;
  label: string;
  description: string;
}

export const FIGHTING_STYLES: readonly FightingStyleDefinition[] = [
  {
    key: "archery",
    label: "Archery",
    description: "You gain a +2 bonus to attack rolls you make with ranged weapons.",
  },
  {
    key: "defense",
    label: "Defense",
    description: "While you are wearing armor, you gain a +1 bonus to AC.",
  },
  {
    key: "dueling",
    label: "Dueling",
    description:
      "When you are wielding a melee weapon in one hand and no other weapons, you gain a +2 bonus to damage rolls with that weapon.",
  },
  {
    key: "greatWeaponFighting",
    label: "Great Weapon Fighting",
    description:
      "When you roll a 1 or 2 on a damage die for an attack you make with a melee weapon that you are wielding with two hands, you can reroll the die and must use the new roll.",
  },
  {
    key: "protection",
    label: "Protection",
    description:
      "When a creature you can see attacks a target other than you that is within 5 feet of you, you can use your reaction to impose disadvantage on the attack roll. You must be wielding a shield.",
  },
  {
    key: "twoWeaponFighting",
    label: "Two-Weapon Fighting",
    description:
      "When you engage in two-weapon fighting, you can add your ability modifier to the damage of the second attack.",
  },
];

/** Returns true if `key` is a known fighting-style key. */
export function isKnownFightingStyle(key: string): key is FightingStyleKey {
  return FIGHTING_STYLES.some((s) => s.key === key);
}

/**
 * How many Fighting Style choices the character is entitled to at this level.
 * Fighter gains one at level 1. Non-fighters get 0 for now (Paladin/Ranger and
 * the Fighter's Champion second style at L10 are out of scope). The result is a
 * level-gated cap consumed by the transaction validator and the read-clamp.
 */
export function fightingStyleChoiceCount(className: string, level: number): number {
  return className.toLowerCase() === "fighter" && level >= 1 ? 1 : 0;
}

/**
 * Derives the additive bonuses a chosen Fighting Style contributes to derived
 * stats. Today only Defense (+1 AC) is a simple additive bonus; the others are
 * conditional/situational (archery is handled in deriveWeaponAttackBonus;
 * dueling/great-weapon/two-weapon/protection are descriptive for now).
 */
export function deriveFightingStyleBonuses(
  styleKey: FightingStyleKey | null | undefined,
): { armorClass: number } {
  return { armorClass: styleKey === "defense" ? 1 : 0 };
}

// ── Spellcasting ability by class ────────────────────────────────────────────
// Maps a class name (lowercase) to the ability that governs its spellcasting.
// Used to derive spellSaveDC and spellAttackBonus at read time.
// Warlock uses Pact Magic (single-level slots, short-rest recharge) and Paladin/
// Ranger use the half-caster table — all handled by deriveSpellcasting below.
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
const FULL_CASTER_CLASSES = new Set(["wizard", "sorcerer", "cleric", "druid", "bard"]);

// Half-casters (Paladin, Ranger) — gain spellcasting at class level 2 and use
// the half-caster slot table below (equivalent to the full table at ceil(level/2)).
const HALF_CASTER_CLASSES = new Set(["paladin", "ranger"]);

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

// Multiclass spell-slot table (PHB p. 164). Per RAW it is byte-for-byte the
// full-caster table, so we alias it rather than duplicate 20 rows — the shared
// table is what keeps single-class output identical to deriveSpellcasting.
export const MULTICLASS_SPELL_SLOTS = FULL_CASTER_SLOTS;

export interface DerivedSpellcastingInfo {
  ability: string;
  spellSaveDC: number;
  spellAttackBonus: number;
  slotTotals: Array<{ level: number; total: number }>;
  /**
   * Warlock Mystic Arcanum — one free cast per long rest of a spell at each
   * listed level (6th–9th). Empty for every non-Warlock caster. Each entry has
   * `total: 1`; used counts are tracked separately in the stored blob.
   */
  arcana: Array<{ level: number; total: number }>;
}

// Half-caster slot table (Paladin / Ranger). No spellcasting at level 1; slots
// at level N match the full-caster table at ceil(N/2). PHB p. 84 / 91.
// Outer key: character level 2–20.  Inner key: spell slot level.
export const HALF_CASTER_SLOTS: Readonly<Record<number, Readonly<Record<number, number>>>> = {
   2: { 1: 2 },
   3: { 1: 3 },
   4: { 1: 3 },
   5: { 1: 4, 2: 2 },
   6: { 1: 4, 2: 2 },
   7: { 1: 4, 2: 3 },
   8: { 1: 4, 2: 3 },
   9: { 1: 4, 2: 3, 3: 2 },
  10: { 1: 4, 2: 3, 3: 2 },
  11: { 1: 4, 2: 3, 3: 3 },
  12: { 1: 4, 2: 3, 3: 3 },
  13: { 1: 4, 2: 3, 3: 3, 4: 1 },
  14: { 1: 4, 2: 3, 3: 3, 4: 1 },
  15: { 1: 4, 2: 3, 3: 3, 4: 2 },
  16: { 1: 4, 2: 3, 3: 3, 4: 2 },
  17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
};

// Warlock Pact Magic (PHB p. 106). Unlike other casters, every Pact slot is the
// same (highest) level, and they recharge on a SHORT rest. Maps warlock level to
// the single slot level and the number of slots at that level.
export const PACT_MAGIC_SLOTS: Readonly<Record<number, { slotLevel: number; count: number }>> = {
   1: { slotLevel: 1, count: 1 },
   2: { slotLevel: 1, count: 2 },
   3: { slotLevel: 2, count: 2 },
   4: { slotLevel: 2, count: 2 },
   5: { slotLevel: 3, count: 2 },
   6: { slotLevel: 3, count: 2 },
   7: { slotLevel: 4, count: 2 },
   8: { slotLevel: 4, count: 2 },
   9: { slotLevel: 5, count: 2 },
  10: { slotLevel: 5, count: 2 },
  11: { slotLevel: 5, count: 3 },
  12: { slotLevel: 5, count: 3 },
  13: { slotLevel: 5, count: 3 },
  14: { slotLevel: 5, count: 3 },
  15: { slotLevel: 5, count: 3 },
  16: { slotLevel: 5, count: 3 },
  17: { slotLevel: 5, count: 4 },
  18: { slotLevel: 5, count: 4 },
  19: { slotLevel: 5, count: 4 },
  20: { slotLevel: 5, count: 4 },
};

// Warlock Mystic Arcanum (PHB p. 108). At levels 11/13/15/17 the warlock learns
// one spell of level 6/7/8/9 respectively, castable once per long rest without a
// Pact slot. Returns the arcanum spell levels available at a given warlock level.
export function mysticArcanumLevels(warlockLevel: number): number[] {
  const levels: number[] = [];
  if (warlockLevel >= 11) levels.push(6);
  if (warlockLevel >= 13) levels.push(7);
  if (warlockLevel >= 15) levels.push(8);
  if (warlockLevel >= 17) levels.push(9);
  return levels;
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

// ── Caster fractions (multiclass) ─────────────────────────────────────────────
// How much each class contributes to the combined multiclass caster level:
// full = +level, half = +floor(level/2), third = +floor(level/3), pact = tracked
// separately (never merged), none = non-caster. Third casters are keyed by
// subclass (Eldritch Knight / Arcane Trickster) via THIRD_CASTER_SUBCLASSES.
export type CasterFraction = "full" | "half" | "third" | "pact" | "none";

export const CASTER_FRACTION_BY_CLASS: Readonly<Record<string, CasterFraction>> = {
  bard: "full",
  cleric: "full",
  druid: "full",
  sorcerer: "full",
  wizard: "full",
  paladin: "half",
  ranger: "half",
  warlock: "pact",
};

// Whether a caster class prepares spells from a list (Cleric/Druid/Paladin/Wizard)
// or knows a fixed set (Bard/Sorcerer/Ranger/Warlock + third casters).
const SPELL_PREPARATION_BY_CLASS: Readonly<Record<string, "known" | "prepared">> = {
  bard: "known",
  sorcerer: "known",
  ranger: "known",
  warlock: "known",
  cleric: "prepared",
  druid: "prepared",
  paladin: "prepared",
  wizard: "prepared",
};

/** Caster fraction for a class (third casters resolved via subclass). "none" for non-casters. */
export function casterFractionFor(className: string, subclass?: string | null): CasterFraction {
  if (THIRD_CASTER_SUBCLASSES[(subclass ?? "").toLowerCase()]) return "third";
  return CASTER_FRACTION_BY_CLASS[className.toLowerCase()] ?? "none";
}

// ── Multiclass ability-score prerequisites (PHB p. 163) ───────────────────────
// Adding a level in a NEW class via multiclassing requires a minimum ability
// score (13). Each class maps to a list of OPTIONS: the prerequisite is met when
// ANY one option is fully satisfied — abilities within an option are AND-ed,
// options are OR-ed. Fighter is the only OR class ("Str 13 or Dex 13").
export const MULTICLASS_PREREQUISITES: Readonly<Record<string, Record<string, number>[]>> = {
  barbarian: [{ strength: 13 }],
  bard: [{ charisma: 13 }],
  cleric: [{ wisdom: 13 }],
  druid: [{ wisdom: 13 }],
  fighter: [{ strength: 13 }, { dexterity: 13 }],
  monk: [{ dexterity: 13, wisdom: 13 }],
  paladin: [{ strength: 13, charisma: 13 }],
  ranger: [{ dexterity: 13, wisdom: 13 }],
  rogue: [{ dexterity: 13 }],
  sorcerer: [{ charisma: 13 }],
  warlock: [{ charisma: 13 }],
  wizard: [{ intelligence: 13 }],
};

export interface MulticlassPrerequisiteResult {
  met: boolean;
  // Human-readable requirement, e.g. "Strength 13 or Dexterity 13". Empty for a
  // homebrew/unknown class, which carries no prerequisite (always met).
  description: string;
}

// Abilities are always single lowercase words here, so a literal capitalize is
// safe (this is a backend error-message string, not UI key rendering).
function capitalizeAbility(ability: string): string {
  return ability.charAt(0).toUpperCase() + ability.slice(1);
}

/**
 * Whether `abilityScores` satisfy the 5e multiclass ability prerequisite for
 * `className`. Unknown/homebrew classes carry no prerequisite and are always met.
 */
export function multiclassPrerequisitesMet(
  className: string,
  abilityScores: Record<string, number>,
): MulticlassPrerequisiteResult {
  const options = MULTICLASS_PREREQUISITES[className.toLowerCase()];
  if (!options) return { met: true, description: "" };
  const met = options.some((option) =>
    Object.entries(option).every(([ability, min]) => (abilityScores[ability] ?? 0) >= min),
  );
  const description = options
    .map((option) =>
      Object.entries(option)
        .map(([ability, min]) => `${capitalizeAbility(ability)} ${min}`)
        .join(" and "),
    )
    .join(" or ");
  return { met, description };
}

// Full spellcasting profile of one class entry, or null for a non-caster.
function casterProfile(
  className: string,
  subclass?: string | null,
): { fraction: CasterFraction; ability: string; preparation: "known" | "prepared" } | null {
  const subKey = (subclass ?? "").toLowerCase();
  const thirdAbility = THIRD_CASTER_SUBCLASSES[subKey];
  if (thirdAbility) return { fraction: "third", ability: thirdAbility, preparation: "known" };

  const key = className.toLowerCase();
  const fraction = CASTER_FRACTION_BY_CLASS[key];
  if (!fraction) return null;
  return { fraction, ability: SPELLCASTING_ABILITY[key], preparation: SPELL_PREPARATION_BY_CLASS[key] };
}

// Levels a class entry adds to the combined multiclass caster level.
function casterLevelContribution(fraction: CasterFraction, level: number): number {
  if (fraction === "full") return level;
  if (fraction === "half") return Math.floor(level / 2);
  if (fraction === "third") return Math.floor(level / 3);
  return 0; // pact + none never contribute to the merged pool
}

/** One caster class's derived per-class spellcasting stats in a multiclass character. */
export interface MulticlassCasterClass {
  className: string;
  subclass: string | null;
  ability: string;
  spellSaveDC: number;
  spellAttackBonus: number;
  preparation: "known" | "prepared";
  casterFraction: CasterFraction;
}

/** Merged multiclass spellcasting: combined slots + per-class stats + separate Pact Magic. */
export interface MulticlassSpellcastingInfo {
  combinedCasterLevel: number;
  slotTotals: Array<{ level: number; total: number }>;
  classes: MulticlassCasterClass[];
  pact: { slotLevel: number; count: number; spellSaveDC: number; spellAttackBonus: number } | null;
  arcana: Array<{ level: number; total: number }>;
}

/**
 * Derives merged spellcasting for a full (possibly multiclass) class list per
 * the PHB p. 164 multiclass rules: sum full levels, half of half-caster levels,
 * a third of third-caster levels, then read the combined caster level against
 * the multiclass slot table. Warlock Pact Magic (and Mystic Arcanum) is kept
 * separate — never merged into the combined pool.
 *
 * When exactly one class contributes to the combined pool, its own class table
 * is used (via deriveSpellcasting) so single-class output stays byte-for-byte
 * identical — the multiclass floor math only kicks in with two+ casters.
 *
 * Pure function — no DB access, safe to call in serializeCharacter.
 */
export function deriveMulticlassSpellcasting(
  classEntries: ReadonlyArray<{ name: string; level: number; subclass?: string | null }>,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
): MulticlassSpellcastingInfo {
  const classes: MulticlassCasterClass[] = [];
  const combinedEntries: Array<{ name: string; level: number; subclass?: string | null; fraction: CasterFraction }> = [];
  let combinedCasterLevel = 0;
  let pact: MulticlassSpellcastingInfo["pact"] = null;
  let arcana: Array<{ level: number; total: number }> = [];

  for (const entry of classEntries) {
    const profile = casterProfile(entry.name, entry.subclass);
    if (!profile) continue;

    const abilityMod = abilityModifier(abilityScores[profile.ability] ?? 10);
    const spellSaveDC = 8 + proficiencyBonus + abilityMod;
    const spellAttackBonus = proficiencyBonus + abilityMod;
    classes.push({
      className: entry.name,
      subclass: entry.subclass ?? null,
      ability: profile.ability,
      spellSaveDC,
      spellAttackBonus,
      preparation: profile.preparation,
      casterFraction: profile.fraction,
    });

    if (profile.fraction === "pact") {
      const p = PACT_MAGIC_SLOTS[Math.min(20, Math.max(1, entry.level))];
      if (p) pact = { slotLevel: p.slotLevel, count: p.count, spellSaveDC, spellAttackBonus };
      arcana = mysticArcanumLevels(entry.level).map((level) => ({ level, total: 1 }));
    } else {
      combinedCasterLevel += casterLevelContribution(profile.fraction, entry.level);
      combinedEntries.push({ ...entry, fraction: profile.fraction });
    }
  }

  let slotTotals: Array<{ level: number; total: number }> = [];
  if (combinedEntries.length === 1) {
    // Single contributing caster: use its own class table (odd-level half/third
    // rows differ from the multiclass floor math) — byte-for-byte deriveSpellcasting.
    const only = combinedEntries[0];
    slotTotals = deriveSpellcasting(only.name, only.level, abilityScores, proficiencyBonus, only.subclass ?? undefined)?.slotTotals ?? [];
  } else if (combinedEntries.length > 1 && combinedCasterLevel > 0) {
    slotTotals = Object.entries(MULTICLASS_SPELL_SLOTS[Math.min(20, combinedCasterLevel)] ?? {})
      .map(([lvl, total]) => ({ level: Number(lvl), total }))
      .sort((a, b) => a.level - b.level);
  }

  return { combinedCasterLevel, slotTotals, classes, pact, arcana };
}

/**
 * Derives the mechanical spellcasting stats (ability, save DC, attack bonus,
 * slot totals, Mystic Arcanum charges) from a character's class, level, ability
 * scores, and proficiency bonus. Returns null for non-casters — callers fall
 * back to the stored blob.
 *
 * Covers full casters, half-casters (Paladin/Ranger), Warlock Pact Magic, and
 * the third-caster subclasses (Eldritch Knight / Arcane Trickster).
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
  // Builds the standard save-DC / attack-bonus pair plus a sorted slotTotals
  // array from a per-level slot row, for a given governing ability.
  const fromSlotRow = (
    ability: string,
    slotRow: Readonly<Record<number, number>>,
    arcana: Array<{ level: number; total: number }> = [],
  ): DerivedSpellcastingInfo => {
    const abilityMod = abilityModifier(abilityScores[ability] ?? 10);
    const slotTotals = Object.entries(slotRow)
      .map(([lvl, total]) => ({ level: Number(lvl), total }))
      .sort((a, b) => a.level - b.level);
    return {
      ability,
      spellSaveDC: 8 + proficiencyBonus + abilityMod,
      spellAttackBonus: proficiencyBonus + abilityMod,
      slotTotals,
      arcana,
    };
  };

  // Check third-caster subclasses first — they grant spellcasting independent
  // of the base class's caster status (Fighter/Rogue are not casters without them).
  const subclassKey = (subclass ?? "").toLowerCase();
  const thirdCasterAbility = THIRD_CASTER_SUBCLASSES[subclassKey];
  if (thirdCasterAbility) {
    if (characterLevel < 3) return null; // subclass (and its spellcasting) unlocked at level 3
    return fromSlotRow(
      thirdCasterAbility,
      THIRD_CASTER_SLOTS[Math.min(20, Math.max(3, characterLevel))] ?? {},
    );
  }

  const classKey = className.toLowerCase();
  const ability = SPELLCASTING_ABILITY[classKey];
  if (!ability) return null; // non-caster class

  if (FULL_CASTER_CLASSES.has(classKey)) {
    return fromSlotRow(ability, FULL_CASTER_SLOTS[Math.min(20, Math.max(1, characterLevel))] ?? {});
  }

  if (HALF_CASTER_CLASSES.has(classKey)) {
    if (characterLevel < 2) return null; // half-casters gain spellcasting at level 2
    return fromSlotRow(ability, HALF_CASTER_SLOTS[Math.min(20, characterLevel)] ?? {});
  }

  if (classKey === "warlock") {
    const pact = PACT_MAGIC_SLOTS[Math.min(20, Math.max(1, characterLevel))];
    if (!pact) return null;
    const arcana = mysticArcanumLevels(characterLevel).map((level) => ({ level, total: 1 }));
    return fromSlotRow(ability, { [pact.slotLevel]: pact.count }, arcana);
  }

  return null;
}

/** Standard 5e modifier: floor((score - 10) / 2). */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * The DC of the Constitution saving throw to maintain concentration after
 * taking damage (5e PHB): 10, or half the damage taken (rounded down),
 * whichever is higher. The save is made once per instance of damage.
 *
 *   e.g. 9 damage  → max(10, 4)  = 10
 *        10 damage → max(10, 5)  = 10
 *        22 damage → max(10, 11) = 11
 */
export function concentrationSaveDC(damage: number): number {
  return Math.max(10, Math.floor(damage / 2));
}

// ── Ability Score Improvement / Feat slot table ───────────────────────────────
// Per 5e PHB: most classes get ASI slots at levels 4, 8, 12, 16, 19.
// Fighter gets two extras (levels 6 and 14); Rogue gets one extra (level 10).
// Returns the *total* number of slots the character has earned at `level`.

const BASE_ASI_LEVELS = [4, 8, 12, 16, 19];
const EXTRA_ASI_LEVELS: Record<string, number[]> = {
  fighter: [6, 14],
  rogue:   [10],
};

/**
 * Returns the cumulative number of Ability Score Improvement / Feat slots
 * the character has earned at `level`. Homebrew / unknown classes fall back
 * to the base 5-slot schedule.
 */
export function advancementSlotsForLevel(className: string, level: number): number {
  const extra = EXTRA_ASI_LEVELS[className.toLowerCase()] ?? [];
  return [...BASE_ASI_LEVELS, ...extra].filter((l) => level >= l).length;
}

/** Parses a hit die string like "d8" into its face value (8). */
export function hitDieFace(hitDie: string): number {
  return Number(hitDie.replace(/^d/i, ""));
}

// ── Armor & weapon proficiency grants ────────────────────────────────────────

/** Armor categories that a character can be proficient with. */
export type ArmorProficiencyCategory = "light" | "medium" | "heavy" | "shield";

/** Static armor/weapon proficiency grants from a class or race. */
export interface ProficiencyGrant {
  armor: ArmorProficiencyCategory[];
  /** May contain category labels ("Simple Weapons", "Martial Weapons") and/or
   *  specific weapon names ("Longswords"). Mixed — display renders them verbatim. */
  weapons: string[];
}

/**
 * Fixed weapon/armor proficiencies granted by each class at creation (PHB).
 * Keyed by class display name, matching CharacterClassEntry.name from the seed.
 * Unknown class names are treated as granting nothing — no crash, no spurious grants.
 */
export const CLASS_PROFICIENCY_GRANTS: Record<string, ProficiencyGrant> = {
  Barbarian: { armor: ["light", "medium", "shield"], weapons: ["Simple Weapons", "Martial Weapons"] },
  Bard:      { armor: ["light"],                     weapons: ["Simple Weapons", "Hand Crossbows", "Longswords", "Rapiers", "Shortswords"] },
  Cleric:    { armor: ["light", "medium", "shield"], weapons: ["Simple Weapons"] },
  Druid:     { armor: ["light", "medium", "shield"], weapons: ["Clubs", "Daggers", "Darts", "Javelins", "Maces", "Quarterstaffs", "Scimitars", "Sickles", "Slings", "Spears"] },
  Fighter:   { armor: ["light", "medium", "heavy", "shield"], weapons: ["Simple Weapons", "Martial Weapons"] },
  Monk:      { armor: [],                            weapons: ["Simple Weapons", "Shortswords"] },
  Paladin:   { armor: ["light", "medium", "heavy", "shield"], weapons: ["Simple Weapons", "Martial Weapons"] },
  Ranger:    { armor: ["light", "medium", "shield"], weapons: ["Simple Weapons", "Martial Weapons"] },
  Rogue:     { armor: ["light"],                     weapons: ["Simple Weapons", "Hand Crossbows", "Longswords", "Rapiers", "Shortswords"] },
  Sorcerer:  { armor: [],                            weapons: ["Daggers", "Darts", "Slings", "Quarterstaffs", "Light Crossbows"] },
  Warlock:   { armor: ["light"],                     weapons: ["Simple Weapons"] },
  Wizard:    { armor: [],                            weapons: ["Daggers", "Darts", "Slings", "Quarterstaffs", "Light Crossbows"] },
};

/**
 * Fixed weapon/armor proficiencies granted by race (PHB).
 * Keyed by race display name, matching raceSelection.name from the seed.
 * Races not listed (Human, Halfling, Gnome, Tiefling, etc.) grant nothing — omitted.
 */
export const RACE_PROFICIENCY_GRANTS: Record<string, ProficiencyGrant> = {
  // Dwarven weapon training; Mountain Dwarf additionally gets light + medium armor.
  "Hill Dwarf":     { armor: [],                  weapons: ["Battleaxes", "Handaxes", "Light Hammers", "Warhammers"] },
  "Mountain Dwarf": { armor: ["light", "medium"], weapons: ["Battleaxes", "Handaxes", "Light Hammers", "Warhammers"] },
  // Elf weapon training varies by subrace.
  "High Elf": { armor: [], weapons: ["Longswords", "Shortswords", "Shortbows", "Longbows"] },
  "Wood Elf": { armor: [], weapons: ["Longswords", "Shortswords", "Shortbows", "Longbows"] },
  Drow:       { armor: [], weapons: ["Rapiers", "Shortswords", "Hand Crossbows"] },
  // Legacy generic key: back-compat for any character created before the race list
  // was expanded to named subraces (Hill/Mountain/High/Wood/Drow).
  Dwarf:      { armor: [], weapons: ["Battleaxes", "Handaxes", "Light Hammers", "Warhammers"] },
};

// ── Weapon proficiency matching ──────────────────────────────────────────────

/**
 * Returns true if the character is proficient with the given weapon based on
 * their merged weapon proficiency grants.
 *
 * Grant entries mix two forms:
 *   - Category labels: "Simple Weapons" / "Martial Weapons" — matched by
 *     `weapon.weaponClass` enum value ("simple" / "martial").
 *   - Pluralised specific weapon names: "Longswords", "Hand Crossbows" —
 *     matched by stripping the trailing "s" and comparing case-insensitively
 *     to the weapon's display name (catalog names are singular).
 *
 * Tolerates `null`/`undefined` weaponClass (no category match; falls back to
 * name matching only).
 */
export function isProficientWithWeapon(
  weapon: { name: string; weaponClass?: string | null },
  grants: ReadonlyArray<{ name: string }>,
): boolean {
  const lcName = weapon.name.toLowerCase();
  for (const grant of grants) {
    if (grant.name === "Simple Weapons" && weapon.weaponClass === "simple") return true;
    if (grant.name === "Martial Weapons" && weapon.weaponClass === "martial") return true;
    // Specific weapon: grants are plural ("Longswords"), catalog names are singular.
    const grantSingular = grant.name.toLowerCase().replace(/s$/, "");
    if (grantSingular === lcName) return true;
  }
  return false;
}

/**
 * Derives the melee/ranged attack bonus for a single weapon. Mirrors the
 * derive-don't-persist pattern of `deriveSpellcasting`: computed at read time
 * from character ability scores, proficiency bonus, and the weapon's metadata.
 *
 * Ability selection per 5e PHB rules:
 *   - Ranged weapons (`weaponRange === "ranged"`) → DEX modifier.
 *   - Finesse weapons → higher of STR or DEX modifier.
 *   - All other melee weapons → STR modifier.
 *
 * Proficiency bonus is added only if the character is proficient with the
 * weapon (category-level or name-level match from `isProficientWithWeapon`).
 */
/** Shared helper — same ability-selection rule used for both attack and damage. */
function weaponAbilityMod(
  weapon: { finesse: boolean; weaponRange?: string | null },
  effectiveScores: Record<string, number>,
): number {
  const strMod = abilityModifier(effectiveScores.strength ?? 10);
  const dexMod = abilityModifier(effectiveScores.dexterity ?? 10);
  if (weapon.weaponRange === "ranged") return dexMod;
  if (weapon.finesse) return Math.max(strMod, dexMod);
  return strMod;
}

export function deriveWeaponAttackBonus(
  weapon: {
    name: string;
    finesse: boolean;
    weaponClass?: string | null;
    weaponRange?: string | null;
  },
  effectiveScores: Record<string, number>,
  proficiencyBonus: number,
  weaponGrants: ReadonlyArray<{ name: string }>,
  /**
   * The character's chosen Fighting Style, if any. Archery contributes +2 to
   * attack rolls with ranged weapons; all other styles are no-ops here.
   */
  fightingStyle?: FightingStyleKey | null,
): number {
  const abilityMod = weaponAbilityMod(weapon, effectiveScores);
  const proficient = isProficientWithWeapon(weapon, weaponGrants);
  const archeryBonus =
    fightingStyle === "archery" && weapon.weaponRange === "ranged" ? 2 : 0;
  return abilityMod + (proficient ? proficiencyBonus : 0) + archeryBonus;
}

export type WeaponGrip = "one-handed" | "two-handed" | "versatile-two-handed";

/**
 * Derives the damage roll spec for a weapon, choosing the correct die for
 * versatile weapons based on what else is equipped.
 *
 * Grip rule (5e PHB):
 *   - `twoHanded` weapons always use their base dice (no off-hand applies).
 *   - Versatile weapons use their **two-handed die** when the off-hand is free
 *     (no equipped shield and no other equipped weapon). Otherwise one-handed.
 *   - All other weapons use their base dice.
 *
 * Damage modifier follows the same ability-selection rule as attackBonus
 * (ranged → DEX, finesse → max(STR, DEX), else STR) so attack and damage stay
 * consistent and we never duplicate that rule.
 */
export function deriveWeaponDamage(
  weapon: {
    name: string;
    finesse: boolean;
    weaponRange?: string | null;
    damageDiceCount: number;
    damageDiceFaces: number;
    damageType: string;
    versatileDiceCount?: number | null;
    versatileDiceFaces?: number | null;
    twoHanded: boolean;
  },
  /** True if any other equipped item occupies the off-hand (shield or weapon). */
  offHandOccupied: boolean,
  effectiveScores: Record<string, number>,
): {
  damageDiceCount: number;
  damageDiceFaces: number;
  damageModifier: number;
  damageType: string;
  grip: WeaponGrip;
} {
  const damageModifier = weaponAbilityMod(weapon, effectiveScores);

  // Resolve grip and choose dice.
  const isVersatile =
    weapon.versatileDiceCount != null && weapon.versatileDiceFaces != null;
  const useTwoHandedDie = isVersatile && !offHandOccupied && !weapon.twoHanded;

  const damageDiceCount = useTwoHandedDie
    ? weapon.versatileDiceCount!
    : weapon.damageDiceCount;
  const damageDiceFaces = useTwoHandedDie
    ? weapon.versatileDiceFaces!
    : weapon.damageDiceFaces;

  const grip: WeaponGrip = weapon.twoHanded
    ? "two-handed"
    : useTwoHandedDie
      ? "versatile-two-handed"
      : "one-handed";

  return { damageDiceCount, damageDiceFaces, damageModifier, damageType: weapon.damageType, grip };
}

// ── Unarmed strike + improvised weapon derivation ─────────────────────────────

/**
 * Returns the unarmed-strike damage die face count for the given advancements.
 * Default is 1 (1 + STR mod, minimum 1 per 5e PHB). Tavern Brawler raises it to
 * d4 via a `{ target: "unarmedDamageDie", amount: 4 }` improvement. When multiple
 * feats would affect this (future-proofing), the max wins — you never "downgrade"
 * a damage die.
 */
export function deriveUnarmedDamageDie(advancements: AdvancementEntry[]): number {
  let best = 1; // default: "1" (flat 1 + STR mod, minimum 1)
  for (const entry of advancements) {
    for (const imp of entry.improvements ?? []) {
      if (imp.target === "unarmedDamageDie") {
        best = Math.max(best, imp.amount);
      }
    }
  }
  return best;
}

/**
 * Derives the unarmed-strike attack bonus and damage spec for a character.
 * Unarmed strikes are always proficient (5e PHB) and always use STR.
 * `unarmedDamageDie` is 1 by default (flat 1 + STR mod) and is raised to 4
 * by Tavern Brawler.
 */
export function deriveUnarmedStrike(
  effectiveScores: Record<string, number>,
  proficiencyBonus: number,
  unarmedDamageDie: number,
): {
  attackBonus: number;
  damage: { count: number; faces: number; modifier: number; damageType: string };
} {
  const strMod = abilityModifier(effectiveScores.strength ?? 10);
  return {
    attackBonus: strMod + proficiencyBonus,
    damage: {
      count: 1,
      faces: unarmedDamageDie,
      modifier: Math.max(0, strMod), // d1 baseline guarantees at least 1 total
      damageType: "bludgeoning",
    },
  };
}

/**
 * Derives the improvised-weapon attack bonus and damage spec for a character.
 * Per 5e PHB: improvised weapons deal 1d4 bludgeoning and use STR. A character
 * is normally **not** proficient with improvised weapons unless they have Tavern
 * Brawler (which grants a `weaponProficiency` for "Improvised Weapons").
 */
export function deriveImprovisedAttack(
  effectiveScores: Record<string, number>,
  proficiencyBonus: number,
  proficient: boolean,
): {
  attackBonus: number;
  proficient: boolean;
  damage: { count: number; faces: number; modifier: number; damageType: string };
} {
  const strMod = abilityModifier(effectiveScores.strength ?? 10);
  return {
    attackBonus: strMod + (proficient ? proficiencyBonus : 0),
    proficient,
    damage: { count: 1, faces: 4, modifier: strMod, damageType: "bludgeoning" },
  };
}

export interface ToolProficiencyEntry {
  name: string;
  /** Origin of the proficiency — used to distinguish creation-fixed entries
   *  (never trimmed on level-down) from subclass-granted ones (reconciled). */
  source: "background" | "class" | "race";
}

export interface DeriveCharacterInput {
  abilityScores: Record<string, number>;
  skillProficiencies: string[];
  /** Tool proficiencies granted by background / class / race at creation. */
  toolProficiencies?: ToolProficiencyEntry[];
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
  /** Creation-fixed tool proficiencies (background / class / race).
   *  Stored in Character.toolProficiencies Json column; never reconciled on level-down. */
  toolProficiencies: ToolProficiencyEntry[];
  currency: { cp: number; sp: number; gp: number; pp: number };
  spellcasting: null;
}

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
    toolProficiencies: input.toolProficiencies ?? [],
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
    spellcasting: null,
  };
}

// ── Feat improvement targets ──────────────────────────────────────────────────

/**
 * Numeric stat targets: summed by deriveFeatBonuses and applied as additive
 * bonuses in serializeCharacter. Adding a target here + a new apply site in
 * serializeCharacter is all that's needed to support it for catalog and custom feats.
 */
export const NUMERIC_FEAT_IMPROVEMENT_TARGETS = [
  "initiative",
  "speed",
  "armorClass",
  "maxHp",
] as const;

export type NumericFeatImprovementTarget = (typeof NUMERIC_FEAT_IMPROVEMENT_TARGETS)[number];

/**
 * Proficiency targets: keyed improvements (imp.key identifies the specific
 * skill, ability, armor category, or weapon name/category being granted).
 * Applied by deriveFeatProficiencies rather than deriveFeatBonuses.
 */
export const PROFICIENCY_FEAT_IMPROVEMENT_TARGETS = [
  "skillProficiency",
  "savingThrowProficiency",
  "armorProficiency",   // key = ArmorProficiencyCategory ("light" | "medium" | "heavy" | "shield")
  "weaponProficiency",  // key = weapon category ("Simple Weapons") or specific name ("Longswords")
] as const;

export type ProficiencyFeatImprovementTarget = (typeof PROFICIENCY_FEAT_IMPROVEMENT_TARGETS)[number];

/**
 * Combat-modifier targets: not summed as flat bonuses but used to derive
 * per-attack properties at read time (e.g. raising the unarmed-strike damage die).
 * `unarmedDamageDie` stores the die face count (e.g. 4 → d4); derivation takes
 * the max across all active advancements rather than summing them.
 */
export const COMBAT_FEAT_IMPROVEMENT_TARGETS = [
  "unarmedDamageDie", // amount = die face count (e.g. 4 for d4); max across feats
] as const;

export type CombatFeatImprovementTarget = (typeof COMBAT_FEAT_IMPROVEMENT_TARGETS)[number];

/**
 * All valid FeatImprovement.target values. Used for route-level Zod validation.
 * Adding a new target here + wiring it in serializeCharacter is all that's needed.
 */
export const FEAT_IMPROVEMENT_TARGETS = [
  ...NUMERIC_FEAT_IMPROVEMENT_TARGETS,
  ...PROFICIENCY_FEAT_IMPROVEMENT_TARGETS,
  ...COMBAT_FEAT_IMPROVEMENT_TARGETS,
] as const;

export type FeatImprovementTarget = (typeof FEAT_IMPROVEMENT_TARGETS)[number];

/**
 * Sums all numeric feat improvement bonuses across a set of advancements.
 * `appliedLevel` is hitDice.total (the number of explicit level-ups applied),
 * used to scale perLevel bonuses (e.g. Tough = +2 per applied level).
 *
 * Callers pass the **already-clamped** (in-cap) advancements slice so
 * over-cap feats are automatically excluded — no reversal logic needed.
 *
 * Proficiency targets (skillProficiency, savingThrowProficiency) fall through
 * the `if (!(target in totals)) continue` guard — handled by deriveFeatProficiencies.
 */
export function deriveFeatBonuses(
  advancements: AdvancementEntry[],
  appliedLevel: number,
): Record<NumericFeatImprovementTarget, number> {
  const totals: Record<NumericFeatImprovementTarget, number> = {
    initiative: 0,
    speed: 0,
    armorClass: 0,
    maxHp: 0,
  };

  for (const entry of advancements) {
    for (const imp of (entry.improvements ?? [])) {
      const target = imp.target as NumericFeatImprovementTarget;
      if (!(target in totals)) continue; // unknown / proficiency target — skip gracefully
      totals[target] += imp.perLevel ? imp.amount * appliedLevel : imp.amount;
    }
  }

  return totals;
}

/**
 * Collects proficiency grants from feat improvements across a set of advancements.
 * Returns four sets:
 *   - `skills`:       camelCase skill keys (e.g. "athletics") where `target === "skillProficiency"`
 *   - `savingThrows`: ability names (e.g. "strength") where `target === "savingThrowProficiency"`
 *   - `armor`:        ArmorProficiencyCategory values (e.g. "light") where `target === "armorProficiency"`
 *   - `weapons`:      weapon category/name strings (e.g. "Longswords") where `target === "weaponProficiency"`
 *
 * Callers pass the **already-clamped** slice so over-cap feats are excluded automatically.
 */
export function deriveFeatProficiencies(
  advancements: AdvancementEntry[],
): { skills: Set<string>; savingThrows: Set<string>; armor: Set<string>; weapons: Set<string> } {
  const skills = new Set<string>();
  const savingThrows = new Set<string>();
  const armor = new Set<string>();
  const weapons = new Set<string>();

  for (const entry of advancements) {
    for (const imp of (entry.improvements ?? [])) {
      if (!imp.key) continue;
      if (imp.target === "skillProficiency") skills.add(imp.key);
      else if (imp.target === "savingThrowProficiency") savingThrows.add(imp.key);
      else if (imp.target === "armorProficiency") armor.add(imp.key);
      else if (imp.target === "weaponProficiency") weapons.add(imp.key);
    }
  }

  return { skills, savingThrows, armor, weapons };
}
