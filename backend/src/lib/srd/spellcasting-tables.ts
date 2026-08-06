import type { RulesEdition } from "@character-sheet/shared-types";

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
// Verified byte-identical between SRD 5.1 and SRD 5.2 (#1507) — no `edition`.
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

// Half-caster slot table (Paladin / Ranger). Verified column-by-column against
// SRD 5.1 (#1507): levels 2-20 match exactly; only level 1 forks (SRD 5.2 grants
// two 1st-level slots there, SRD 5.1 has none — spellcastingStartLevel gates
// that, not this table, so the table itself takes no `edition`). Outer key:
// character level 1–20.
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

// Warlock Pact Magic (PHB p. 106). Byte-identical between SRD 5.1 and SRD 5.2
// (#1507) — no `edition`. Unlike other casters, every Pact slot is the same
// (highest) level, and they recharge on a SHORT rest. Maps warlock level to the
// single slot level and the number of slots at that level.
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

// Warlock Mystic Arcanum (PHB p. 108). The 11/13/15/17 gate levels are
// byte-identical between SRD 5.1 and SRD 5.2 (#1507) — no `edition`. At levels
// 11/13/15/17 the warlock learns one spell of level 6/7/8/9 respectively,
// castable once per long rest without a Pact slot. Returns the arcanum spell
// levels available at a given warlock level.
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

// Third-caster slot table (PHB Fighter/Rogue spell slot table). EK/AT are in
// neither SRD; re-verified against a PHB'14 transcription during the #1507
// build and byte-identical to the PHB'24 table — no `edition`.
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

// Verified edition-invariant (#1507): SRD 5.1's multiclass text ("…and half
// your levels (rounded down) in the paladin and ranger classes…") is the same
// rule as SRD 5.2's — no `edition`.
/** Caster fraction for a class (third casters resolved via subclass). "none" for non-casters. */
export function casterFractionFor(className: string, subclass?: string | null): CasterFraction {
  if (THIRD_CASTER_SUBCLASSES[(subclass ?? "").toLowerCase()]) return "third";
  return CASTER_FRACTION_BY_CLASS[className.toLowerCase()] ?? "none";
}

// Spellcasting profile of one class entry, or null for a non-caster. SRD 5.2
// collapsed the known/prepared split — every caster now prepares (see
// PREPARED_SPELLS_BY_CLASS). SRD 5.1 still has the split (see casterModelFor,
// #1507), but the fraction/ability pair below is verified edition-invariant
// (SRD 5.1's multiclass text matches SRD 5.2's), so this profile itself takes
// no `edition`.
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
// #1507: reused as-is for EDITION_2014 — EK/AT are in neither SRD, so this column
// was re-verified against PHB'14 pp. 74-75 (Fighter, Eldritch Knight) / pp. 97-98
// (Rogue, Arcane Trickster) during the #1507 build and is byte-identical to the
// SRD 5.2 Prepared Spells column above. One array serves both editions — do not
// "fix" the missing fork.
const THIRD_CASTER_PREPARED = [3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13] as const;

// SRD 5.1 Spells Known (2014 "known" casters — Bard/Sorcerer/Ranger; Warlock
// reuses PREPARED_SPELLS_BY_CLASS.warlock below, see preparedSpellCountAt).
// Cleric/Druid/Wizard/Paladin are "prepared" casters in SRD 5.1 too, computed by
// formula (ability modifier + level, or half-level for Paladin) rather than a
// table — see preparedSpellCountAt's EDITION_2014 branch.
const SPELLS_KNOWN_BY_CLASS_2014: Readonly<Record<string, ReadonlyArray<number | null>>> = {
  // SRD 5.1 Bard table, "Spells Known" column, levels 1-20.
  bard: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
  // SRD 5.1 Sorcerer table, "Spells Known" column, levels 1-20.
  sorcerer: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
  // SRD 5.1 Ranger table, "Spells Known" column, levels 1-20. Level 1 is a dash
  // (—) in the book — null here, not 0 — because the Ranger has no Spellcasting
  // feature at all until level 2 (spellcastingStartLevel gates this, not the 0).
  ranger: [null, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
};

/**
 * The level a class's spellcasting (slots AND prepared/known cap) begins —
 * read by BOTH deriveSpellcasting's half/third-caster branches and
 * preparedSpellCountAt's null-return (#1507 D4), so the slot table and the cap
 * can never disagree about whether a class casts at all at a given level.
 * 3 for a third-caster subclass (PHB'24 Fighter/Rogue tables, both editions);
 * 2 for a 2014 Paladin/Ranger (PHB'14 p. 84/92: Spellcasting is a 2nd-level
 * feature, the level-1 slot row is five dashes); 1 otherwise (SRD 5.2 half-
 * casters cast from level 1 — CLAUDE.md's "half-caster from level 2" clause
 * names only levels 2+, where the two editions' slot tables already agree).
 */
export function spellcastingStartLevel(
  className: string,
  subclass: string | null | undefined,
  edition: RulesEdition,
): number {
  if (THIRD_CASTER_SUBCLASSES[(subclass ?? "").toLowerCase()]) return 3;
  if (edition === "EDITION_2014" && HALF_CASTER_CLASSES.has(className.toLowerCase())) return 2;
  return 1;
}

// SRD 5.1 "known" caster count: Bard/Sorcerer/Ranger read the fixed Spells
// Known table directly. `key` is already lowercased and already confirmed
// present in SPELLS_KNOWN_BY_CLASS_2014 by the caller.
function knownSpellCount2014(key: string, level: number): number | null {
  return SPELLS_KNOWN_BY_CLASS_2014[key][Math.min(20, level) - 1] ?? null;
}

// SRD 5.1 "prepared" caster formula: Cleric/Druid/Wizard use
// `ability modifier + class level` (min 1); Paladin uses
// `ability modifier + floor(class level / 2)` (min 1) — PHB'14 pp. 56-59/
// 64-67/82-85/112-115, each "minimum of one spell" verbatim in the class
// text. `key` is already lowercased by the caller.
function preparedFormulaCount2014(key: string, level: number, abilityScores: Record<string, number>): number | null {
  const ability = SPELLCASTING_ABILITY[key];
  if (!ability) return null; // non-caster class
  const mod = abilityModifier(abilityScores[ability] ?? 10);
  if (key === "paladin") return Math.max(1, mod + Math.floor(level / 2));
  if (key === "cleric" || key === "druid" || key === "wizard") return Math.max(1, mod + level);
  return null; // non-caster class
}

// SRD 5.1 branch of preparedSpellCountAt, split out (and split again into the
// two helpers above) to keep cyclomatic complexity under the repo's health
// gate. `key` is already lowercased by the caller. Warlock reuses
// PREPARED_SPELLS_BY_CLASS.warlock rather than knownSpellCount2014's table
// (verified identical, see that array's comment) — one array serving two
// call shapes, not a third table.
function preparedSpellCount2014(key: string, level: number, abilityScores: Record<string, number>): number | null {
  if (key in SPELLS_KNOWN_BY_CLASS_2014) return knownSpellCount2014(key, level);
  if (key === "warlock") return PREPARED_SPELLS_BY_CLASS.warlock[Math.min(20, Math.max(1, level)) - 1] ?? null;
  return preparedFormulaCount2014(key, level, abilityScores);
}

/**
 * Prepared/known-spell count for one class entry at its level, or null when the
 * entry is not a caster at that level (non-caster, or below spellcastingStartLevel).
 * Third casters resolve via `subclass`.
 *
 * SRD 5.2: a fixed per-class table count (PREPARED_SPELLS_BY_CLASS).
 *
 * SRD 5.1: dispatches to preparedSpellCount2014 above (see its comment for the
 * per-class breakdown).
 */
export function preparedSpellCountAt(
  className: string,
  level: number,
  subclass: string | null | undefined,
  abilityScores: Record<string, number>,
  edition: RulesEdition,
): number | null {
  if (level < spellcastingStartLevel(className, subclass, edition)) return null;

  const subKey = (subclass ?? "").toLowerCase();
  if (THIRD_CASTER_SUBCLASSES[subKey]) {
    return THIRD_CASTER_PREPARED[Math.min(20, level) - 3] ?? null;
  }

  const key = className.toLowerCase();
  if (edition === "EDITION_2014") {
    return preparedSpellCount2014(key, level, abilityScores);
  }

  const table = PREPARED_SPELLS_BY_CLASS[key];
  if (!table) return null;
  return table[Math.min(20, Math.max(1, level)) - 1] ?? null;
}

/**
 * Prepared/known-spell cap: preparedSpellCountAt summed across every caster
 * class entry for multiclass (#1507 D9: a mixed-model multiclass sums into one
 * cap — imprecise for a 2014 known+prepared mix, accepted and recorded rather
 * than deferred). Returns null only when no entry is a caster. Pure function —
 * no DB access, safe to call in serializeCharacter.
 *
 * Deliberate-coupling latch (#1507 D2): this is the ONE function both
 * reconcilePreparedSpells (lib/leveling/level-reconciliation.ts, the write-side
 * reconciler) and buildSpellcastingView (lib/character/serialize/spellcasting.ts,
 * the read-side clamp) call — never two inline copies of the cap.
 */
export function derivePreparedSpellLimit(
  classEntries: ReadonlyArray<{ name: string; level: number; subclass?: string | null }>,
  abilityScores: Record<string, number>,
  edition: RulesEdition,
): number | null {
  let total = 0;
  let anyCaster = false;
  for (const entry of classEntries) {
    const count = preparedSpellCountAt(entry.name, entry.level, entry.subclass, abilityScores, edition);
    if (count == null) continue;
    anyCaster = true;
    total += count;
  }
  return anyCaster ? total : null;
}

// 2014 "known" casters (SRD 5.1's "Spells Known of 1st Level and Higher"
// heading): Bard, Sorcerer, Warlock, Ranger, and EK/AT — a chosen spell is
// immediately castable, no separate preparation step (D5/D7). Cleric, Druid,
// Wizard, Paladin carry SRD 5.1's "Preparing and Casting Spells" heading
// instead — same "prepared" model as every SRD 5.2 caster.
const KNOWN_CASTER_CLASSES_2014: ReadonlySet<string> = new Set(["bard", "sorcerer", "warlock", "ranger"]);

/**
 * Whether a class entry's chosen spells are immediately castable ("known") or
 * must be prepared from a wider list ("prepared"); null for a non-caster.
 * SRD 5.2 collapsed the split — every caster is "prepared". SRD 5.1 forks per
 * class per the KNOWN_CASTER_CLASSES_2014 set above (EK/AT resolve via
 * `subclass`, same as every third-caster check in this module).
 */
export function casterModelFor(
  className: string,
  subclass: string | null | undefined,
  edition: RulesEdition,
): "known" | "prepared" | null {
  const isThirdCaster = Boolean(THIRD_CASTER_SUBCLASSES[(subclass ?? "").toLowerCase()]);
  const key = className.toLowerCase();
  if (!isThirdCaster && CASTER_FRACTION_BY_CLASS[key] === undefined) return null; // non-caster
  if (edition !== "EDITION_2014") return "prepared";
  return isThirdCaster || KNOWN_CASTER_CLASSES_2014.has(key) ? "known" : "prepared";
}

/**
 * D5 multiclass resolution: "known" only when EVERY caster class entry is a
 * known caster; "prepared" otherwise (the permissive UI — a mixed-model
 * multiclass character gets prepare-style affordances everywhere); null when no
 * entry is a caster. The ONE combiner both buildSpellcastingView (the served
 * wire field) and applyLearnSpellOp (D7, lib/spellcasting/spellcasting.ts) call
 * — never two inline copies.
 */
export function casterModelForEntries(
  classEntries: ReadonlyArray<{ name: string; subclass?: string | null }>,
  edition: RulesEdition,
): "known" | "prepared" | null {
  let anyCaster = false;
  let allKnown = true;
  for (const entry of classEntries) {
    const model = casterModelFor(entry.name, entry.subclass, edition);
    if (model == null) continue;
    anyCaster = true;
    if (model !== "known") allKnown = false;
  }
  if (!anyCaster) return null;
  return allKnown ? "known" : "prepared";
}

// #1511 D4: user-facing nouns for the served caster model — served, never
// composed client-side (CLAUDE.md: the frontend never originates a rule). A
// known caster's chosen spells are never "prepared" in the SRD 5.1 sense, so
// the meter/roster noun and the rune's locked-state word both fork off the
// same casterModel this module already computes; this map carries no rules
// text of its own, only the copy naming a model decided above.
export const CASTER_MODEL_LABELS: Record<
  "known" | "prepared",
  { preparedLabel: string; alwaysAvailableLabel: string }
> = {
  known: { preparedLabel: "Spells known", alwaysAvailableLabel: "Known" },
  prepared: { preparedLabel: "Prepared", alwaysAvailableLabel: "Always prepared" },
};

// Cantrips known, as [minLevel, count] breakpoints (highest applicable wins).
// Verified byte-identical between SRD 5.1 and SRD 5.2 (#1507) for all six
// progressions — no `edition`. Paladin/Ranger prepare no cantrips. Drives
// levelUpCantripPicks (#1131).
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

/**
 * Swap cadence for a class (EK/AT resolve via subclass to onLevelUp); null for a
 * non-caster. Forks for 2014 Ranger and Paladin: SRD 5.1 Ranger — "when you gain
 * a level in this class, you can choose one of the ranger spells you know and
 * replace it" (a level-up swap, not the SRD 5.2 `oneOnLongRest`); SRD 5.1
 * Paladin has no swap restriction at all (it's a re-prepare "prepared" caster
 * from the start, grouped with Cleric/Druid/Wizard's `anyOnLongRest`, not
 * SRD 5.2's `oneOnLongRest`). The other six classes agree with 2024.
 */
export function swapCadenceFor(
  className: string,
  subclass: string | null | undefined,
  edition: RulesEdition,
): SwapCadence | null {
  if (THIRD_CASTER_SUBCLASSES[(subclass ?? "").toLowerCase()]) return "onLevelUp";
  const key = className.toLowerCase();
  if (edition === "EDITION_2014") {
    if (key === "ranger") return "onLevelUp";
    if (key === "paladin") return "anyOnLongRest";
  }
  return SWAP_CADENCE_BY_CLASS[key] ?? null;
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
  edition: RulesEdition,
): Array<{ level: number; total: number }> {
  if (combinedEntries.length === 1) {
    const only = combinedEntries[0];
    return deriveSpellcasting(only.name, only.level, abilityScores, proficiencyBonus, only.subclass ?? undefined, edition)?.slotTotals ?? [];
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
  edition: RulesEdition,
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

  const slotTotals = resolveCombinedSlotTotals(combinedEntries, combinedCasterLevel, abilityScores, proficiencyBonus, edition);
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
 * @param subclass Subclass name, or null/undefined — used to detect third-caster
 *   subclasses (Eldritch Knight / Arcane Trickster) which grant their own
 *   INT-based spellcasting.
 * @param edition Half-caster start level forks here (#1507 D4): SRD 5.1
 *   Paladin/Ranger have no Spellcasting feature until level 2, gated via
 *   spellcastingStartLevel — the shared predicate that also gates
 *   preparedSpellCountAt, so the slot table and the cap can never disagree.
 */
export function deriveSpellcasting(
  className: string,
  characterLevel: number,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
  subclass: string | null | undefined,
  edition: RulesEdition,
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
    if (characterLevel < spellcastingStartLevel(className, subclass, edition)) return null;
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
    // SRD 5.2: half-casters cast from level 1; SRD 5.1 from level 2 (#1507 D4) —
    // spellcastingStartLevel is the one shared gate for both.
    if (characterLevel < spellcastingStartLevel(className, subclass, edition)) return null;
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
 * Number of new spells a class offers on reaching `level`. Wizard scribes a flat
 * 2 into its spellbook per level from level 2 up — edition-invariant (PHB'14
 * p. 114 / PHB'24 p. 115 carry the identical "add two wizard spells" clause, see
 * WIZARD_LEVEL1_SPELLBOOK_SIZE's own comment). onLevelUp-cadence classes offer
 * the prepared/known-count delta (swapCadenceFor, forked below): Bard/Sorcerer/
 * Warlock + EK/AT in BOTH editions, plus the 2014 Ranger (SRD 5.1's per-class
 * "when you gain a level … replace it with another spell" clause — the 2024
 * Ranger re-prepares on a rest instead and offers no level-up pick). Every other
 * class returns 0 after its level-1 initial picks.
 *
 * `edition` forks the table this reads (#1509 D2): a 2014 known caster's delta
 * comes from SPELLS_KNOWN_BY_CLASS_2014 via preparedSpellCountAt's EDITION_2014
 * branch — the SAME lookup #1507's caps already route through, so this needs no
 * second table and no new symbol.
 */
export function levelUpSpellPicks(
  className: string,
  level: number,
  subclass: string | null | undefined,
  edition: RulesEdition,
): number {
  // #1131: a fresh level-1 entry (creation or multiclass-add) picks its full
  // prepared count — including re-prepare classes, which offer no picks after.
  // A 2014 half-caster (Paladin/Ranger) below spellcastingStartLevel has no
  // spellcasting feature yet, so preparedSpellCountAt returns null here — `?? 0`
  // reads that as "nothing to pick", not a table miss (#1509 D3; this is also
  // the multiclass-add path).
  // #1513: Wizard is the exception — a level-1 pick fills the spellbook (6),
  // not the prepared count (4); WIZARD_LEVEL1_SPELLBOOK_SIZE is the one place
  // that number lives, shared with level1SpellPicksFor.
  if (level <= 1) {
    if (className.toLowerCase() === "wizard") return WIZARD_LEVEL1_SPELLBOOK_SIZE;
    return preparedSpellCountAt(className, 1, subclass, {}, edition) ?? 0;
  }
  if (className.toLowerCase() === "wizard") return 2;
  if (swapCadenceFor(className, subclass, edition) !== "onLevelUp") return 0;
  // #1509 D3: a previous-level count of null (below spellcastingStartLevel — a
  // 2014 Ranger reading its own level 1) reads as 0, not "no data": the class
  // had nothing to compare against, so the whole level-N count is new. Same
  // null-safe read the fresh-entry branch above uses.
  const now = preparedSpellCountAt(className, level, subclass, {}, edition) ?? 0;
  const prev = preparedSpellCountAt(className, level - 1, subclass, {}, edition) ?? 0;
  return Math.max(0, now - prev);
}

/**
 * Number of new cantrips a class offers on reaching `level` (SRD 5.2) — the
 * cantrips-known delta from N-1 to N (full count at level 1). 0 for Paladin/Ranger
 * and non-casters. #1131 wires this into the level-up newSpells step and creation.
 */
export function levelUpCantripPicks(className: string, level: number, subclass?: string | null): number {
  const now = cantripsKnownAtLevel(className, level, subclass);
  const prev = level <= 1 ? 0 : cantripsKnownAtLevel(className, level - 1, subclass);
  return Math.max(0, now - prev);
}

/** Bard Magical Secrets (SRD 5.2): from level 10, level-up picks may come from the Bard/Cleric/Druid/Wizard lists. */
export function bardMagicalSecretsAt(className: string, level: number): boolean {
  return className.toLowerCase() === "bard" && level >= 10;
}

/** Class lists a Magical Secrets-eligible level-up pick may come from, per facet. `null` = unrestricted. */
export interface MagicalSecretsLists {
  /** Class lists a leveled pick may come from; null = unrestricted (PHB'14 "from any class"). */
  spells: string[] | null;
  /** Class lists a cantrip pick may come from; null = unrestricted (PHB'14 "…or a cantrip"). */
  cantrips: string[] | null;
}

/**
 * Bard Magical Secrets, edition-forked. Governs BOTH the leveled-spell and the
 * cantrip facet of a level-up pick — one rule, `edition` last (`subclassGateLevel`
 * pattern) — because the two editions disagree on whether it broadens cantrips.
 *
 * SRD 5.2 / PHB'24 p. 53, *Magical Secrets* (Bard, level 10): "Whenever you reach
 * a Bard level (including this level) and the Prepared Spells number in the Bard
 * Features table increases, you can choose any of your new prepared spells from
 * the Bard, Cleric, Druid, and Wizard spell lists" — a standing broadening from
 * level 10 up (`>= 10`, not `=== 10`), hence `spells` widens but `cantrips` does
 * not: the trigger is the Prepared Spells number, which only covers level 1+
 * spells — the Cantrips column is a separate table untouched by this feature.
 *
 * PHB'14 p. 54, *Magical Secrets* (Bard, 10th/14th/18th level): "Choose two
 * spells from any class, including this one. A spell you choose must be of a
 * level you can cast, as shown on the Bard table, or a cantrip." Both facets are
 * therefore unrestricted (`null`) under 2014.
 *
 * Recorded limitation: PHB'14 grants this as *two of* the picks at 10th/14th/
 * 18th, drawn from one shared two-pick budget (a cantrip taken this way comes
 * out of the same budget as a leveled spell). This codebase models
 * `spellsLearned`/`cantripsLearned` as separate buckets sized by the 2024 tables
 * (`levelUpSpellPicks`/`levelUpCantripPicks`/`CANTRIP_BREAKPOINTS`), which are not
 * forked per edition — epic #1281 owns that fork. With no single budget to draw
 * from, the closest available mapping is: at a qualifying 2014 Bard level,
 * neither facet is class-restricted. This is not full PHB'14 fidelity.
 *
 * Also known: class membership lives in the SpellClass join, keyed off the
 * parent Spell row rather than carrying its own edition column (#1711) —
 * today's seeded catalog is 2024-only; the 2014 by-class content slices
 * (#1713-#1721) are what populate 2014-tagged Spell/SpellClass rows.
 *
 * `subclass` is currently unused but is the deliberate seam for PHB'24 College of
 * Lore *Magical Discoveries* (level 6, a Cleric/Druid/Wizard cantrip OR a spell
 * you have slots for) and PHB'14 *Additional Magical Secrets* (6th level, any
 * class) — both are content debt for #1281, not implemented here.
 */
export function magicalSecretsSpellLists(
  className: string,
  level: number,
  subclass: string | null | undefined,
  edition: RulesEdition,
): MagicalSecretsLists {
  const key = className.toLowerCase();
  if (key !== "bard" || level < 10) return { spells: [key], cantrips: [key] };
  if (edition === "EDITION_2014") return { spells: null, cantrips: null };
  return { spells: ["bard", "cleric", "druid", "wizard"], cantrips: ["bard"] };
}

/**
 * Highest spell level a class can cast/scribe at `level` — the ceiling on spells
 * learnable at level-up. Derived from the slot table (max slot level) rather than
 * re-encoding thresholds; 0 when the class has no spellcasting yet (non-casters,
 * a 2014 Paladin/Ranger below level 2 — the #1508 AC this closes: a served
 * `level1SpellPicks` with spells > 0 alongside maxSpellLevel === 0 is
 * incoherent, so callers must treat 0 here as "not casting yet", never clamp
 * it to 1). Third-caster subclasses resolve via `subclass`.
 */
export function maxSpellLevelForClass(
  className: string,
  level: number,
  subclass: string | null | undefined,
  edition: RulesEdition,
): number {
  // Ability scores / proficiency don't affect slot LEVELS, so pass neutral values.
  const derived = deriveSpellcasting(className, level, {}, 2, subclass ?? undefined, edition);
  if (!derived) return 0;
  return derived.slotTotals.reduce((max, slot) => Math.max(max, slot.level), 0);
}

// #1510: SRD 5.1's level-1 CREATION-time spell picks — a fixed table, not the
// ongoing ability-mod-driven cap preparedSpellCountAt computes. The owner's
// rationale-correcting comment on #1510 (2026-07-29) records three distinct
// caster shapes, only some of which have a creation-time list at all:
//   - "known" (Bard/Sorcerer/Warlock): a fixed personal list, chosen here and
//     swappable per swapCadenceFor's onLevelUp cadence.
//   - "prepared from the full class list" (Cleric/Druid): NO personal list
//     exists in PHB'14 — the WIS-mod cap governs a subset re-prepared every
//     long rest (derivePreparedSpellLimit). There is nothing to pick at
//     creation, so 0 is the faithful count, not a placeholder or a guess.
//   - "spellbook" (Wizard): a personal list distinct in SIZE from what's
//     prepared daily — served by WIZARD_LEVEL1_SPELLBOOK_SIZE below (#1513),
//     not this table, since the same split also has to reach EDITION_2024
//     (this table is 2014-only).
// Paladin/Ranger are absent entirely: SRD 5.1 grants no Spellcasting feature
// at level 1 at all (spellcastingStartLevel gates them out below; this table
// is never consulted for them).
const LEVEL1_CREATION_SPELLS_2014: Readonly<Record<string, number>> = {
  // known — SRD 5.1: "You know four 1st-level spells of your choice from the bard spell list."
  bard: 4,
  // known — SRD 5.1: "You know two 1st-level spells of your choice from the sorcerer spell list."
  sorcerer: 2,
  // known — SRD 5.1: "At 1st level, you know two 1st-level spells of your choice from the warlock spell list."
  warlock: 2,
  // prepared-from-full-list — SRD 5.1: prepares WIS mod + level from the whole class list; no known list exists.
  cleric: 0,
  // prepared-from-full-list — SRD 5.1: prepares WIS mod + level from the whole class list; no known list exists.
  druid: 0,
};

// Wizard's level-1 SPELLBOOK size — distinct from its PREPARED count
// (preparedSpellCountAt / PREPARED_SPELLS_BY_CLASS.wizard[0] === 4), which
// #1513 fixes a conflation of. Both editions agree on six, so this constant
// carries no `edition` parameter and is the ONE place the number 6 lives —
// level1SpellPicksFor's `spells`/`spellbookSize` fields and
// levelUpSpellPicks's level<=1 branch both read it, never a second copy.
// SRD 5.1, Wizard, "Your Spellbook": "At 1st level, you have a spellbook
// containing six 1st-level wizard spells of your choice." SRD 5.2, Wizard
// level 1, Spellcasting: the spellbook starts with six level-1 wizard spells;
// the Prepared Spells column (4 at level 1) is a separate, smaller number.
const WIZARD_LEVEL1_SPELLBOOK_SIZE = 6;

/**
 * The level-1 CREATION-time spell picks a class offers, per edition — folds in
 * #1377's maxSpellLevel so `reference.ts` and `creationSpellCountError` (#1510
 * D4) resolve the served and enforced counts through this ONE function, never
 * two inline copies.
 *
 * `null` = no Spells step this creation: a non-caster, or below
 * spellcastingStartLevel (a 2014 Paladin/Ranger, or a level-1 third-caster
 * subclass in either edition — neither has Spellcasting yet).
 *
 * `spells: 0` = a cantrips-only step (2014 Cleric/Druid — see
 * LEVEL1_CREATION_SPELLS_2014's comment for why 0 is correct, not a
 * placeholder). `maxSpellLevel` is 0 in that case too (the cantrips-only seam
 * #1377 built — `spells.test.ts` pins `?maxLevel=0` as legal, not a floor of
 * 1) — a served `spells: n > 0` alongside `maxSpellLevel: 0` would be the
 * incoherent shape #1508 already flagged for the null case, so this keeps the
 * same discipline for the zero case.
 *
 * SRD 5.2: reuses preparedSpellCountAt's fixed table directly (no separate
 * 2024 table to keep in sync) — EXCEPT Wizard, whose creation pick is its
 * spellbook size, not its prepared count (#1513, WIZARD_LEVEL1_SPELLBOOK_SIZE).
 * SRD 5.1: the fixed table above (Wizard excepted the same way); cantrips are
 * verified byte-identical between both editions (cantripsKnownAtLevel takes no
 * `edition`), so one call serves both branches.
 *
 * `spellbookSize` (#1513) is present, and equal to `spells`, ONLY for Wizard —
 * it marks that this class's creation-pick count is the spellbook size, not
 * the prepared cap, so a consumer can never mistake one for the other. Every
 * other class omits the key; the prepared cap itself is never served here —
 * callers read it from preparedSpellCountAt / derivePreparedSpellLimit.
 */
export function level1SpellPicksFor(
  className: string,
  subclass: string | null | undefined,
  edition: RulesEdition,
): { cantrips: number; spells: number; maxSpellLevel: number; spellbookSize?: number } | null {
  if (spellcastingStartLevel(className, subclass, edition) > 1) return null;

  const isWizard = className.toLowerCase() === "wizard";
  const spells = isWizard
    ? WIZARD_LEVEL1_SPELLBOOK_SIZE
    : edition === "EDITION_2014"
      ? (LEVEL1_CREATION_SPELLS_2014[className.toLowerCase()] ?? null)
      : preparedSpellCountAt(className, 1, subclass, {}, edition);
  if (spells == null) return null; // non-caster

  const cantrips = cantripsKnownAtLevel(className, 1, subclass);
  const maxSpellLevel = spells === 0 ? 0 : maxSpellLevelForClass(className, 1, subclass, edition);
  return {
    cantrips,
    spells,
    maxSpellLevel,
    ...(isWizard ? { spellbookSize: WIZARD_LEVEL1_SPELLBOOK_SIZE } : {}),
  };
}
