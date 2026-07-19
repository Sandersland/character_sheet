import { abilityModifier } from "@/lib/srd/math.js";

// Maps a class name (lowercase) to the ability that governs its spellcasting.
// Used to derive spellSaveDC and spellAttackBonus at read time.
// Warlock uses Pact Magic (single-level slots, short-rest recharge) and Paladin/
// Ranger use the half-caster table — all handled by deriveSpellcasting below.
const SPELLCASTING_ABILITY: Readonly<Record<string, string>> = {
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

// Half-caster slot table (Paladin / Ranger). SRD 5.2: half-casters gain
// spellcasting at level 1 (two 1st-level slots); higher levels match the
// full-caster table at ceil(N/2). Outer key: character level 1–20.
const HALF_CASTER_SLOTS: Readonly<Record<number, Readonly<Record<number, number>>>> = {
   1: { 1: 2 },
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
const PACT_MAGIC_SLOTS: Readonly<Record<number, { slotLevel: number; count: number }>> = {
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
function mysticArcanumLevels(warlockLevel: number): number[] {
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
const THIRD_CASTER_SLOTS: Readonly<Record<number, Readonly<Record<number, number>>>> = {
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

/** Caster fraction for a class (third casters resolved via subclass). "none" for non-casters. */
export function casterFractionFor(className: string, subclass?: string | null): CasterFraction {
  if (THIRD_CASTER_SUBCLASSES[(subclass ?? "").toLowerCase()]) return "third";
  return CASTER_FRACTION_BY_CLASS[className.toLowerCase()] ?? "none";
}

// Spellcasting profile of one class entry, or null for a non-caster. SRD 5.2
// collapsed the known/prepared split — every caster now prepares (see
// PREPARED_SPELLS_BY_CLASS), so preparation is no longer part of the profile.
function casterProfile(
  className: string,
  subclass?: string | null,
): { fraction: CasterFraction; ability: string } | null {
  const subKey = (subclass ?? "").toLowerCase();
  const thirdAbility = THIRD_CASTER_SUBCLASSES[subKey];
  if (thirdAbility) return { fraction: "third", ability: thirdAbility };

  const key = className.toLowerCase();
  const fraction = CASTER_FRACTION_BY_CLASS[key];
  if (!fraction) return null;
  return { fraction, ability: SPELLCASTING_ABILITY[key] };
}

// Levels a class entry adds to the combined multiclass caster level.
function casterLevelContribution(fraction: CasterFraction, level: number): number {
  if (fraction === "full") return level;
  if (fraction === "half") return Math.floor(level / 2);
  if (fraction === "third") return Math.floor(level / 3);
  return 0; // pact + none never contribute to the merged pool
}

// SRD 5.2 prepared-spell counts, indexed by (class level − 1). 2024 rules: every
// caster prepares a fixed table count (no longer ability mod + level). Bard,
// Cleric, and Druid share one column; Paladin and Ranger share the half-caster
// column and prepare from level 1.
const FULL_CASTER_PREPARED = [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22] as const;
const HALF_CASTER_PREPARED = [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15] as const;

export const PREPARED_SPELLS_BY_CLASS: Readonly<Record<string, readonly number[]>> = {
  bard: FULL_CASTER_PREPARED,
  cleric: FULL_CASTER_PREPARED,
  druid: FULL_CASTER_PREPARED,
  sorcerer: [2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  wizard: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25],
  warlock: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
  paladin: HALF_CASTER_PREPARED,
  ranger: HALF_CASTER_PREPARED,
};

// Third-caster (Eldritch Knight / Arcane Trickster) prepared counts, indexed by
// (class level − 3) — spellcasting begins at level 3 (PHB'24 Fighter/Rogue tables).
const THIRD_CASTER_PREPARED = [3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13] as const;

/**
 * Prepared-spell count for one class entry at its level (SRD 5.2 tables), or null
 * when the entry is not a caster at that level (non-caster, or a third caster
 * below level 3). Third casters resolve via `subclass`.
 */
export function preparedSpellCountAt(className: string, level: number, subclass?: string | null): number | null {
  const subKey = (subclass ?? "").toLowerCase();
  if (THIRD_CASTER_SUBCLASSES[subKey]) {
    if (level < 3) return null; // subclass (and its spellcasting) unlocked at level 3
    return THIRD_CASTER_PREPARED[Math.min(20, level) - 3] ?? null;
  }
  const table = PREPARED_SPELLS_BY_CLASS[className.toLowerCase()];
  if (!table) return null;
  return table[Math.min(20, Math.max(1, level)) - 1] ?? null;
}

/**
 * Prepared-spell cap (SRD 5.2): a fixed per-class table count, summed across
 * every caster class entry for multiclass. Returns null only when no entry is a
 * caster. Pure function — no DB access, safe to call in serializeCharacter.
 */
export function derivePreparedSpellLimit(
  classEntries: ReadonlyArray<{ name: string; level: number; subclass?: string | null }>,
): number | null {
  let total = 0;
  let anyCaster = false;
  for (const entry of classEntries) {
    const count = preparedSpellCountAt(entry.name, entry.level, entry.subclass);
    if (count == null) continue;
    anyCaster = true;
    total += count;
  }
  return anyCaster ? total : null;
}

// SRD 5.2 cantrips known, as [minLevel, count] breakpoints (highest applicable
// wins). Paladin/Ranger prepare no cantrips. Data only for now — the level-up
// cantrip step is wired in #1131.
const CANTRIP_BREAKPOINTS: Readonly<Record<string, ReadonlyArray<readonly [number, number]>>> = {
  bard: [[1, 2], [4, 3], [10, 4]],
  cleric: [[1, 3], [4, 4], [10, 5]],
  druid: [[1, 2], [4, 3], [10, 4]],
  sorcerer: [[1, 4], [4, 5], [10, 6]],
  wizard: [[1, 3], [4, 4], [10, 5]],
  warlock: [[1, 2], [4, 3], [10, 4]],
};
const THIRD_CASTER_CANTRIPS: ReadonlyArray<readonly [number, number]> = [[3, 2], [10, 3]];

/** Cantrips known at a class level (SRD 5.2); 0 for Paladin/Ranger and non-casters. */
export function cantripsKnownAtLevel(className: string, level: number, subclass?: string | null): number {
  const breakpoints = THIRD_CASTER_SUBCLASSES[(subclass ?? "").toLowerCase()]
    ? THIRD_CASTER_CANTRIPS
    : CANTRIP_BREAKPOINTS[className.toLowerCase()];
  if (!breakpoints) return 0;
  let count = 0;
  for (const [min, c] of breakpoints) if (level >= min) count = c;
  return count;
}

// How a caster changes its prepared spells (SRD 5.2): "onLevelUp" replaces one on
// gaining a class level (Bard/Sorcerer/Warlock + EK/AT); "oneOnLongRest" swaps one
// per long rest (Paladin/Ranger); "anyOnLongRest" re-prepares freely on a long
// rest (Cleric/Druid/Wizard). Swap TIMING is not enforced (#1127 decision) — only
// the cap is; this drives the level-up new-spell step and swap affordance.
export type SwapCadence = "onLevelUp" | "oneOnLongRest" | "anyOnLongRest";

const SWAP_CADENCE_BY_CLASS: Readonly<Record<string, SwapCadence>> = {
  bard: "onLevelUp",
  sorcerer: "onLevelUp",
  warlock: "onLevelUp",
  cleric: "anyOnLongRest",
  druid: "anyOnLongRest",
  wizard: "anyOnLongRest",
  paladin: "oneOnLongRest",
  ranger: "oneOnLongRest",
};

/** Swap cadence for a class (EK/AT resolve via subclass to onLevelUp); null for a non-caster. */
export function swapCadenceFor(className: string, subclass?: string | null): SwapCadence | null {
  if (THIRD_CASTER_SUBCLASSES[(subclass ?? "").toLowerCase()]) return "onLevelUp";
  return SWAP_CADENCE_BY_CLASS[className.toLowerCase()] ?? null;
}

/** One caster class's derived per-class spellcasting stats in a multiclass character. */
export interface MulticlassCasterClass {
  className: string;
  subclass: string | null;
  ability: string;
  spellSaveDC: number;
  spellAttackBonus: number;
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

/** One caster class after its per-entry save DC / attack bonus are resolved. */
type CombinedEntry = { name: string; level: number; subclass?: string | null; fraction: CasterFraction };

/**
 * The combined-pool slot totals. A lone contributing caster uses its own class
 * table (odd-level half/third rows differ from the multiclass floor math) so
 * single-class output stays byte-for-byte identical with deriveSpellcasting;
 * two+ casters use the multiclass floor table keyed by combined caster level.
 */
function resolveCombinedSlotTotals(
  combinedEntries: CombinedEntry[],
  combinedCasterLevel: number,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
): Array<{ level: number; total: number }> {
  if (combinedEntries.length === 1) {
    const only = combinedEntries[0];
    return deriveSpellcasting(only.name, only.level, abilityScores, proficiencyBonus, only.subclass ?? undefined)?.slotTotals ?? [];
  }
  if (combinedEntries.length > 1 && combinedCasterLevel > 0) {
    return Object.entries(MULTICLASS_SPELL_SLOTS[Math.min(20, combinedCasterLevel)] ?? {})
      .map(([lvl, total]) => ({ level: Number(lvl), total }))
      .sort((a, b) => a.level - b.level);
  }
  return [];
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
  const combinedEntries: CombinedEntry[] = [];
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
      casterFraction: profile.fraction,
    });

    if (profile.fraction === "pact") {
      // Warlock Pact Magic stays separate from the combined pool.
      const p = PACT_MAGIC_SLOTS[Math.min(20, Math.max(1, entry.level))];
      if (p) pact = { slotLevel: p.slotLevel, count: p.count, spellSaveDC, spellAttackBonus };
      arcana = mysticArcanumLevels(entry.level).map((level) => ({ level, total: 1 }));
    } else {
      combinedCasterLevel += casterLevelContribution(profile.fraction, entry.level);
      combinedEntries.push({ ...entry, fraction: profile.fraction });
    }
  }

  const slotTotals = resolveCombinedSlotTotals(combinedEntries, combinedCasterLevel, abilityScores, proficiencyBonus);
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
    // SRD 5.2: half-casters cast from level 1.
    return fromSlotRow(ability, HALF_CASTER_SLOTS[Math.min(20, Math.max(1, characterLevel))] ?? {});
  }

  if (classKey === "warlock") {
    const pact = PACT_MAGIC_SLOTS[Math.min(20, Math.max(1, characterLevel))];
    if (!pact) return null;
    const arcana = mysticArcanumLevels(characterLevel).map((level) => ({ level, total: 1 }));
    return fromSlotRow(ability, { [pact.slotLevel]: pact.count }, arcana);
  }

  return null;
}

/**
 * Number of new spells a class offers on reaching `level` (SRD 5.2). Wizard
 * scribes a flat 2 into its spellbook per level from level 2 up. onLevelUp-cadence
 * classes (Bard/Sorcerer/Warlock + EK/AT) offer the prepared-count delta. Every
 * other class re-prepares on a rest and offers no level-up pick (returns 0).
 */
export function levelUpSpellPicks(className: string, level: number, subclass?: string | null): number {
  if (className.toLowerCase() === "wizard") return level >= 2 ? 2 : 0;
  if (swapCadenceFor(className, subclass) !== "onLevelUp") return 0;
  const now = preparedSpellCountAt(className, level, subclass) ?? 0;
  const prev = level <= 1 ? 0 : preparedSpellCountAt(className, level - 1, subclass) ?? 0;
  return Math.max(0, now - prev);
}

/** Bard Magical Secrets (SRD 5.2): from level 10, level-up picks may come from the Bard/Cleric/Druid/Wizard lists. */
export function bardMagicalSecretsAt(className: string, level: number): boolean {
  return className.toLowerCase() === "bard" && level >= 10;
}

/**
 * Highest spell level a class can cast/scribe at `level` — the ceiling on spells
 * learnable at level-up. Derived from the slot table (max slot level) rather than
 * re-encoding thresholds; 0 when the class has no spellcasting yet (non-casters,
 * a Ranger below level 2). Third-caster subclasses resolve via `subclass`.
 */
export function maxSpellLevelForClass(className: string, level: number, subclass?: string | null): number {
  // Ability scores / proficiency don't affect slot LEVELS, so pass neutral values.
  const derived = deriveSpellcasting(className, level, {}, 2, subclass ?? undefined);
  if (!derived) return 0;
  return derived.slotTotals.reduce((max, slot) => Math.max(max, slot.level), 0);
}
