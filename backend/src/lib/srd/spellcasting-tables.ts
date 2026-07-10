import { abilityModifier } from "@/lib/srd/math.js";

// ── Spellcasting ability by class ────────────────────────────────────────────
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

// Half-caster slot table (Paladin / Ranger). No spellcasting at level 1; slots
// at level N match the full-caster table at ceil(N/2). PHB p. 84 / 91.
// Outer key: character level 2–20.  Inner key: spell slot level.
const HALF_CASTER_SLOTS: Readonly<Record<number, Readonly<Record<number, number>>>> = {
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
