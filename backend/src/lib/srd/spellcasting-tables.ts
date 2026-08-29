import type { RulesEdition } from "@character-sheet/shared-types";

import { abilityModifier } from "@/lib/srd/math.js";

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

const FULL_CASTER_CLASSES = new Set(["wizard", "sorcerer", "cleric", "druid", "bard"]);

const HALF_CASTER_CLASSES = new Set(["paladin", "ranger"]);

// PHB'14 p.114; SRD 5.1 and SRD 5.2 byte-identical — no edition fork (#1507).
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

// PHB'14 p.164 — byte-for-byte the full-caster table; aliased rather than duplicated.
export const MULTICLASS_SPELL_SLOTS = FULL_CASTER_SLOTS;

export interface DerivedSpellcastingInfo {
  ability: string;
  spellSaveDC: number;
  spellAttackBonus: number;
  slotTotals: Array<{ level: number; total: number }>;
  // Mystic Arcanum: one free cast per long rest at each listed level (6th-9th); empty for non-Warlock casters.
  arcana: Array<{ level: number; total: number }>;
}

// Half-caster slot table (Paladin/Ranger). Verified against SRD 5.1 (#1507): levels 2-20 match; level 1 forks (SRD 5.2 grants two 1st-level slots, SRD 5.1 has none) but spellcastingStartLevel gates that, not this table.
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

// PHB'14 p.106. Byte-identical between SRD 5.1 and SRD 5.2 (#1507) — no `edition`. Every Pact slot is the same (highest) level and recharges on a short rest.
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

// PHB'14 p.108. Byte-identical between SRD 5.1 and SRD 5.2 (#1507) — no `edition`.
function mysticArcanumLevels(warlockLevel: number): number[] {
  const levels: number[] = [];
  if (warlockLevel >= 11) levels.push(6);
  if (warlockLevel >= 13) levels.push(7);
  if (warlockLevel >= 15) levels.push(8);
  if (warlockLevel >= 17) levels.push(9);
  return levels;
}

// casterFraction is narrowed to a literal enum, not a bare string, so an unrecognized value fails to compile at the call site rather than silently comparing false at runtime.
export interface SubclassCasterRef {
  casterFraction: "third" | null;
  spellcastingAbility: string | null;
}

// Resolves off the Subclass row's own columns, never subclassRef's free-text name.
function thirdCasterAbilityOf(subclassRef: SubclassCasterRef | null | undefined): string | null {
  if (!subclassRef || subclassRef.casterFraction !== "third") return null;
  return subclassRef.spellcastingAbility;
}

// PHB'14 Fighter/Rogue spell slot table. Re-verified during #1507 and byte-identical to PHB'24 — no `edition`. Starts at class level 3.
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

// full = +level, half = +floor(level/2), third = +floor(level/3); pact is tracked separately (never merged); none = non-caster.
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

// Verified edition-invariant (#1507): SRD 5.1's multiclass text ("…and half your levels (rounded down) in the paladin and ranger classes…") matches SRD 5.2 — no `edition`.
export function casterFractionFor(className: string, subclassRef?: SubclassCasterRef | null): CasterFraction {
  if (thirdCasterAbilityOf(subclassRef)) return "third";
  return CASTER_FRACTION_BY_CLASS[className.toLowerCase()] ?? "none";
}

// Fraction/ability pair is edition-invariant (verified against SRD 5.1's multiclass text) — no `edition` param.
function casterProfile(
  className: string,
  subclassRef?: SubclassCasterRef | null,
): { fraction: CasterFraction; ability: string } | null {
  const thirdAbility = thirdCasterAbilityOf(subclassRef);
  if (thirdAbility) return { fraction: "third", ability: thirdAbility };

  const key = className.toLowerCase();
  const fraction = CASTER_FRACTION_BY_CLASS[key];
  if (!fraction) return null;
  return { fraction, ability: SPELLCASTING_ABILITY[key] };
}

function casterLevelContribution(fraction: CasterFraction, level: number): number {
  if (fraction === "full") return level;
  if (fraction === "half") return Math.floor(level / 2);
  if (fraction === "third") return Math.floor(level / 3);
  return 0; // pact + none never contribute to the merged pool
}

// SRD 5.2 prepared-spell counts, indexed by (class level − 1). Bard/Cleric/Druid share one column; Paladin/Ranger share the half-caster column.
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

// Third-caster prepared counts, indexed by (class level − 3); starts at level 3 (PHB'24 Fighter/Rogue tables).
// Re-verified against PHB'14 pp. 74-75 (Fighter/Eldritch Knight) / pp. 97-98 (Rogue/Arcane Trickster) — byte-identical to the SRD 5.2 column above. One array serves both editions — do not "fix" the missing fork.
const THIRD_CASTER_PREPARED = [3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13] as const;

// SRD 5.1 Spells Known (2014 known casters — Bard/Sorcerer/Ranger; Warlock reuses PREPARED_SPELLS_BY_CLASS.warlock, see preparedSpellCountAt).
// Cleric/Druid/Wizard/Paladin are "prepared" casters computed by formula instead — see preparedSpellCountAt's EDITION_2014 branch.
const SPELLS_KNOWN_BY_CLASS_2014: Readonly<Record<string, ReadonlyArray<number | null>>> = {
  bard: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
  sorcerer: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
  // Level 1 is a dash (—) in the book — null here, not 0 — because Ranger has no Spellcasting feature until level 2.
  ranger: [null, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
};

// Read by both deriveSpellcasting and preparedSpellCountAt (#1507 D4) so the slot table and the cap can never disagree.
// 3 for a third-caster subclass (PHB'24 Fighter/Rogue tables); 2 for a 2014 Paladin/Ranger (PHB'14 p. 84/92); 1 otherwise (SRD 5.2 half-casters cast from level 1).
export function spellcastingStartLevel(
  className: string,
  subclassRef: SubclassCasterRef | null | undefined,
  edition: RulesEdition,
): number {
  if (thirdCasterAbilityOf(subclassRef)) return 3;
  if (!HALF_CASTER_CLASSES.has(className.toLowerCase())) return 1;
  switch (edition) {
    case "EDITION_2014":
      return 2;
    case "EDITION_2024":
      return 1;
    default: {
      const exhaustive: never = edition;
      throw new Error(`spellcastingStartLevel: unhandled edition ${String(exhaustive)}`);
    }
  }
}

// SRD 5.1 known-caster count. `key` is already lowercased and confirmed present in SPELLS_KNOWN_BY_CLASS_2014 by the caller.
function knownSpellCount2014(key: string, level: number): number | null {
  return SPELLS_KNOWN_BY_CLASS_2014[key][Math.min(20, level) - 1] ?? null;
}

// SRD 5.1 prepared-caster formula: Cleric/Druid/Wizard use ability modifier + class level (min 1); Paladin uses ability modifier + floor(class level / 2) (min 1) — PHB'14 pp. 56-59/64-67/82-85/112-115.
function preparedFormulaCount2014(key: string, level: number, abilityScores: Record<string, number>): number | null {
  const ability = SPELLCASTING_ABILITY[key];
  if (!ability) return null;
  const mod = abilityModifier(abilityScores[ability] ?? 10);
  if (key === "paladin") return Math.max(1, mod + Math.floor(level / 2));
  if (key === "cleric" || key === "druid" || key === "wizard") return Math.max(1, mod + level);
  return null;
}

// `key` is already lowercased by the caller. Warlock reuses PREPARED_SPELLS_BY_CLASS.warlock rather than a 2014 table of its own — verified identical — one array serving two call shapes.
function preparedSpellCount2014(key: string, level: number, abilityScores: Record<string, number>): number | null {
  if (key in SPELLS_KNOWN_BY_CLASS_2014) return knownSpellCount2014(key, level);
  if (key === "warlock") return PREPARED_SPELLS_BY_CLASS.warlock[Math.min(20, Math.max(1, level)) - 1] ?? null;
  return preparedFormulaCount2014(key, level, abilityScores);
}

export function preparedSpellCountAt(
  className: string,
  level: number,
  subclassRef: SubclassCasterRef | null | undefined,
  abilityScores: Record<string, number>,
  edition: RulesEdition,
): number | null {
  if (level < spellcastingStartLevel(className, subclassRef, edition)) return null;

  if (thirdCasterAbilityOf(subclassRef)) {
    return THIRD_CASTER_PREPARED[Math.min(20, level) - 3] ?? null;
  }

  const key = className.toLowerCase();
  switch (edition) {
    case "EDITION_2014":
      return preparedSpellCount2014(key, level, abilityScores);
    case "EDITION_2024": {
      const table = PREPARED_SPELLS_BY_CLASS[key];
      if (!table) return null;
      return table[Math.min(20, Math.max(1, level)) - 1] ?? null;
    }
    default: {
      const exhaustive: never = edition;
      throw new Error(`preparedSpellCountAt: unhandled edition ${String(exhaustive)}`);
    }
  }
}

// Deliberate-coupling latch (#1507 D2): the one function both reconcilePreparedSpells and buildSpellcastingView call — never two inline copies of the cap.
export function derivePreparedSpellLimit(
  classEntries: ReadonlyArray<{ name: string; level: number; subclassRef?: SubclassCasterRef | null }>,
  abilityScores: Record<string, number>,
  edition: RulesEdition,
): number | null {
  let total = 0;
  let anyCaster = false;
  for (const entry of classEntries) {
    const count = preparedSpellCountAt(entry.name, entry.level, entry.subclassRef, abilityScores, edition);
    if (count == null) continue;
    anyCaster = true;
    total += count;
  }
  return anyCaster ? total : null;
}

// SRD 5.1 "Spells Known of 1st Level and Higher": Bard, Sorcerer, Warlock, Ranger, and EK/AT know spells outright. Cleric, Druid, Wizard, Paladin carry "Preparing and Casting Spells" instead — same model as SRD 5.2.
const KNOWN_CASTER_CLASSES_2014: ReadonlySet<string> = new Set(["bard", "sorcerer", "warlock", "ranger"]);

export function casterModelFor(
  className: string,
  subclassRef: SubclassCasterRef | null | undefined,
  edition: RulesEdition,
): "known" | "prepared" | null {
  const isThirdCaster = Boolean(thirdCasterAbilityOf(subclassRef));
  const key = className.toLowerCase();
  if (!isThirdCaster && CASTER_FRACTION_BY_CLASS[key] === undefined) return null;
  switch (edition) {
    case "EDITION_2014":
      return isThirdCaster || KNOWN_CASTER_CLASSES_2014.has(key) ? "known" : "prepared";
    case "EDITION_2024":
      return "prepared";
    default: {
      const exhaustive: never = edition;
      throw new Error(`casterModelFor: unhandled edition ${String(exhaustive)}`);
    }
  }
}

// The one combiner both buildSpellcastingView and applyLearnSpellOp call — never two inline copies.
export function casterModelForEntries(
  classEntries: ReadonlyArray<{ name: string; subclassRef?: SubclassCasterRef | null }>,
  edition: RulesEdition,
): "known" | "prepared" | null {
  let anyCaster = false;
  let allKnown = true;
  for (const entry of classEntries) {
    const model = casterModelFor(entry.name, entry.subclassRef, edition);
    if (model == null) continue;
    anyCaster = true;
    if (model !== "known") allKnown = false;
  }
  if (!anyCaster) return null;
  return allKnown ? "known" : "prepared";
}

// Served, never composed client-side — the frontend never originates a rule. Carries no rules text of its own, only the copy naming the model casterModelFor/casterModelForEntries already decided.
export const CASTER_MODEL_LABELS: Record<
  "known" | "prepared",
  { preparedLabel: string; alwaysAvailableLabel: string }
> = {
  known: { preparedLabel: "Spells known", alwaysAvailableLabel: "Known" },
  prepared: { preparedLabel: "Prepared", alwaysAvailableLabel: "Always prepared" },
};

// [minLevel, count] breakpoints, highest applicable wins. Verified byte-identical between SRD 5.1 and SRD 5.2 (#1507) — no `edition`.
const CANTRIP_BREAKPOINTS: Readonly<Record<string, ReadonlyArray<readonly [number, number]>>> = {
  bard: [[1, 2], [4, 3], [10, 4]],
  cleric: [[1, 3], [4, 4], [10, 5]],
  druid: [[1, 2], [4, 3], [10, 4]],
  sorcerer: [[1, 4], [4, 5], [10, 6]],
  wizard: [[1, 3], [4, 4], [10, 5]],
  warlock: [[1, 2], [4, 3], [10, 4]],
};
const THIRD_CASTER_CANTRIPS: ReadonlyArray<readonly [number, number]> = [[3, 2], [10, 3]];

export function cantripsKnownAtLevel(className: string, level: number, subclassRef?: SubclassCasterRef | null): number {
  const breakpoints = thirdCasterAbilityOf(subclassRef)
    ? THIRD_CASTER_CANTRIPS
    : CANTRIP_BREAKPOINTS[className.toLowerCase()];
  if (!breakpoints) return 0;
  let count = 0;
  for (const [min, c] of breakpoints) if (level >= min) count = c;
  return count;
}

// SRD 5.2: "onLevelUp" replaces one on a class level (Bard/Sorcerer/Warlock + EK/AT); "oneOnLongRest" swaps one per long rest (Paladin/Ranger); "anyOnLongRest" re-prepares freely (Cleric/Druid/Wizard).
// Swap TIMING is not enforced (#1127) — only the cap is.
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

// Forks for 2014 Ranger (SRD 5.1: "when you gain a level ... you can choose one of the ranger spells you know and replace it" — a level-up swap, not SRD 5.2's oneOnLongRest)
// and 2014 Paladin (no swap restriction — grouped with Cleric/Druid/Wizard's anyOnLongRest, not SRD 5.2's oneOnLongRest).
export function swapCadenceFor(
  className: string,
  subclassRef: SubclassCasterRef | null | undefined,
  edition: RulesEdition,
): SwapCadence | null {
  if (thirdCasterAbilityOf(subclassRef)) return "onLevelUp";
  const key = className.toLowerCase();
  switch (edition) {
    case "EDITION_2014":
      if (key === "ranger") return "onLevelUp";
      if (key === "paladin") return "anyOnLongRest";
      return SWAP_CADENCE_BY_CLASS[key] ?? null;
    case "EDITION_2024":
      return SWAP_CADENCE_BY_CLASS[key] ?? null;
    default: {
      const exhaustive: never = edition;
      throw new Error(`swapCadenceFor: unhandled edition ${String(exhaustive)}`);
    }
  }
}

export interface MulticlassCasterClass {
  className: string;
  subclass: string | null;
  ability: string;
  spellSaveDC: number;
  spellAttackBonus: number;
  casterFraction: CasterFraction;
}

export interface MulticlassSpellcastingInfo {
  combinedCasterLevel: number;
  slotTotals: Array<{ level: number; total: number }>;
  classes: MulticlassCasterClass[];
  pact: { slotLevel: number; count: number; spellSaveDC: number; spellAttackBonus: number } | null;
  arcana: Array<{ level: number; total: number }>;
}

type CombinedEntry = { name: string; level: number; subclassRef?: SubclassCasterRef | null; fraction: CasterFraction };

// A lone caster uses its own class table (odd-level half/third rows differ from the multiclass floor math) so single-class output stays byte-for-byte identical with deriveSpellcasting; two+ casters use the multiclass floor table.
function resolveCombinedSlotTotals(
  combinedEntries: CombinedEntry[],
  combinedCasterLevel: number,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
  edition: RulesEdition,
): Array<{ level: number; total: number }> {
  if (combinedEntries.length === 1) {
    const only = combinedEntries[0];
    return deriveSpellcasting(only.name, only.level, abilityScores, proficiencyBonus, only.subclassRef, edition)?.slotTotals ?? [];
  }
  if (combinedEntries.length > 1 && combinedCasterLevel > 0) {
    return Object.entries(MULTICLASS_SPELL_SLOTS[Math.min(20, combinedCasterLevel)] ?? {})
      .map(([lvl, total]) => ({ level: Number(lvl), total }))
      .sort((a, b) => a.level - b.level);
  }
  return [];
}

// PHB'14 p.164 multiclass rules (edition-invariant): sum full levels, half of half-caster levels, a third of third-caster levels, then read the combined caster level against the multiclass slot table.
// Warlock Pact Magic (and Mystic Arcanum) stays separate — never merged into the combined pool. Pure — safe to call in serializeCharacter.
export function deriveMulticlassSpellcasting(
  classEntries: ReadonlyArray<{ name: string; level: number; subclass?: string | null; subclassRef?: SubclassCasterRef | null }>,
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
    const profile = casterProfile(entry.name, entry.subclassRef);
    if (!profile) continue;

    const abilityMod = abilityModifier(abilityScores[profile.ability] ?? 10);
    const spellSaveDC = 8 + proficiencyBonus + abilityMod;
    const spellAttackBonus = proficiencyBonus + abilityMod;
    classes.push({
      className: entry.name,
      // Display-only — never consulted for resolution; profile above already resolved off entry.subclassRef.
      subclass: entry.subclass ?? null,
      ability: profile.ability,
      spellSaveDC,
      spellAttackBonus,
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

  const slotTotals = resolveCombinedSlotTotals(combinedEntries, combinedCasterLevel, abilityScores, proficiencyBonus, edition);
  return { combinedCasterLevel, slotTotals, classes, pact, arcana };
}

// Pure — safe to call in serializeCharacter. subclassRef is used to detect third-caster subclasses (#1531: resolved off the row, never a name match).
export function deriveSpellcasting(
  className: string,
  characterLevel: number,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
  subclassRef: SubclassCasterRef | null | undefined,
  edition: RulesEdition,
): DerivedSpellcastingInfo | null {
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

  // Check third-caster subclasses first — they grant spellcasting independent of the base class's caster status (Fighter/Rogue are not casters without them).
  const thirdCasterAbility = thirdCasterAbilityOf(subclassRef);
  if (thirdCasterAbility) {
    if (characterLevel < spellcastingStartLevel(className, subclassRef, edition)) return null;
    return fromSlotRow(
      thirdCasterAbility,
      THIRD_CASTER_SLOTS[Math.min(20, Math.max(3, characterLevel))] ?? {},
    );
  }

  const classKey = className.toLowerCase();
  const ability = SPELLCASTING_ABILITY[classKey];
  if (!ability) return null;

  if (FULL_CASTER_CLASSES.has(classKey)) {
    return fromSlotRow(ability, FULL_CASTER_SLOTS[Math.min(20, Math.max(1, characterLevel))] ?? {});
  }

  if (HALF_CASTER_CLASSES.has(classKey)) {
    // SRD 5.2 half-casters cast from level 1; SRD 5.1 from level 2 — spellcastingStartLevel is the shared gate.
    if (characterLevel < spellcastingStartLevel(className, subclassRef, edition)) return null;
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

// Wizard scribes a flat 2 into its spellbook per level from level 2 up — edition-invariant (PHB'14 p. 114 / PHB'24 p. 115).
// onLevelUp-cadence classes offer the prepared/known-count delta (swapCadenceFor); 2014 Ranger is also onLevelUp (SRD 5.1's per-class replace-a-spell clause).
// A 2014 known caster's delta reads through preparedSpellCountAt's EDITION_2014 branch — the same lookup #1507's caps already use, no second table.
export function levelUpSpellPicks(
  className: string,
  level: number,
  subclassRef: SubclassCasterRef | null | undefined,
  edition: RulesEdition,
): number {
  // A fresh level-1 entry picks its full prepared count. A 2014 half-caster below spellcastingStartLevel returns null here — `?? 0` reads that as nothing to pick, not a table miss.
  // Wizard is the exception: a level-1 pick fills the spellbook (6), not the prepared count (4) — WIZARD_LEVEL1_SPELLBOOK_SIZE is the one place that number lives, shared with level1SpellPicksFor.
  if (level <= 1) {
    if (className.toLowerCase() === "wizard") return WIZARD_LEVEL1_SPELLBOOK_SIZE;
    return preparedSpellCountAt(className, 1, subclassRef, {}, edition) ?? 0;
  }
  if (className.toLowerCase() === "wizard") return 2;
  if (swapCadenceFor(className, subclassRef, edition) !== "onLevelUp") return 0;
  // Same null-safe read as above: a previous-level null (below spellcastingStartLevel) means nothing to compare against, so the whole level-N count is new.
  const now = preparedSpellCountAt(className, level, subclassRef, {}, edition) ?? 0;
  const prev = preparedSpellCountAt(className, level - 1, subclassRef, {}, edition) ?? 0;
  return Math.max(0, now - prev);
}

export function levelUpCantripPicks(className: string, level: number, subclassRef?: SubclassCasterRef | null): number {
  const now = cantripsKnownAtLevel(className, level, subclassRef);
  const prev = level <= 1 ? 0 : cantripsKnownAtLevel(className, level - 1, subclassRef);
  return Math.max(0, now - prev);
}

// SRD 5.2: from level 10, picks may come from Bard/Cleric/Druid/Wizard lists.
export function bardMagicalSecretsAt(className: string, level: number): boolean {
  return className.toLowerCase() === "bard" && level >= 10;
}

// Named for the resolver (spellListsFor), not Magical Secrets — it also carries the third-caster (EK/AT → wizard) redirect (#1825).
export interface SpellPickLists {
  // null = unrestricted (PHB'14 "from any class").
  spells: string[] | null;
  // null = unrestricted (PHB'14 "...or a cantrip").
  cantrips: string[] | null;
}

// PHB'14 p. 75 (Eldritch Knight) / p. 98 (Arcane Trickster), byte-identical in PHB'24: third-caster subclasses draw from the wizard list, not their base class's own list.
// Bard Magical Secrets forks by edition on both the leveled-spell and cantrip facet. SRD 5.2 / PHB'24 p. 53: prepared spells may be chosen from the Bard, Cleric, Druid, and Wizard lists from level 10 up;
// cantrips do not widen, since the trigger is the Prepared Spells number, which doesn't cover cantrips. PHB'14 p. 54: "Choose two spells from any class... or a cantrip" — both facets unrestricted (null) under 2014.
// Recorded limitation: PHB'14 grants this as two picks from one shared budget; this codebase models spells/cantrips as separate buckets sized by the 2024 tables, so at a qualifying 2014 Bard level neither facet is class-restricted — not full PHB'14 fidelity.
export function spellListsFor(
  className: string,
  level: number,
  subclassRef: SubclassCasterRef | null | undefined,
  edition: RulesEdition,
): SpellPickLists {
  if (thirdCasterAbilityOf(subclassRef)) return { spells: ["wizard"], cantrips: ["wizard"] };

  const key = className.toLowerCase();
  if (key !== "bard" || level < 10) return { spells: [key], cantrips: [key] };
  // Total mapping over edition, never if/else (#1527).
  switch (edition) {
    case "EDITION_2014":
      return { spells: null, cantrips: null };
    case "EDITION_2024":
      return { spells: ["bard", "cleric", "druid", "wizard"], cantrips: ["bard"] };
    default: {
      const exhaustive: never = edition;
      throw new Error(`spellListsFor: unhandled edition ${String(exhaustive)}`);
    }
  }
}

// PHB'14 p. 74: Fighter grants a free "any school" leveled pick at 3rd, 8th, 14th, and 20th level — one per level, matching THIRD_CASTER_PREPARED's own delta at each (always exactly 1), so no separate count is persisted.
const EK_FREE_SCHOOL_LEVELS = new Set([3, 8, 14, 20]);

// schools: restricted set a leveled pick must belong to, null = unrestricted.
// freePicks: how many of this level-up's picks may ignore it.
export interface SpellSchoolGate {
  schools: string[] | null;
  freePicks: number;
}

const EK_UNRESTRICTED_SCHOOL_GATE: SpellSchoolGate = { schools: null, freePicks: 0 };

// Callers gate this to Eldritch Knight themselves — never a name literal — so this only encodes the LEVEL math. Never applies to cantrips or Arcane Trickster.
// PHB'14 p. 74, Eldritch Knight Spellcasting: two of the spells learned at 3rd level must be Abjuration or Evocation; spells learned at 8th, 14th, and 20th level can come from any school. SRD 5.1 has no Eldritch Knight.
// PHB'24 dropped the restriction — its own EK feature text is unverified/PARKED (#1531), so no page citation is claimed here beyond "the restriction is gone".
export function eldritchKnightSpellSchoolGate(fighterLevel: number, edition: RulesEdition): SpellSchoolGate {
  switch (edition) {
    case "EDITION_2014":
      return { schools: ["abjuration", "evocation"], freePicks: EK_FREE_SCHOOL_LEVELS.has(fighterLevel) ? 1 : 0 };
    case "EDITION_2024":
      return EK_UNRESTRICTED_SCHOOL_GATE;
    default: {
      const exhaustive: never = edition;
      throw new Error(`eldritchKnightSpellSchoolGate: unhandled edition ${String(exhaustive)}`);
    }
  }
}

// Derived from the slot table's max slot level rather than re-encoding thresholds. 0 means not casting yet (non-caster, or a 2014 Paladin/Ranger below level 2) — callers must never clamp that to 1 (#1508).
export function maxSpellLevelForClass(
  className: string,
  level: number,
  subclassRef: SubclassCasterRef | null | undefined,
  edition: RulesEdition,
): number {
  // Ability scores / proficiency don't affect slot LEVELS, so pass neutral values.
  const derived = deriveSpellcasting(className, level, {}, 2, subclassRef, edition);
  if (!derived) return 0;
  return derived.slotTotals.reduce((max, slot) => Math.max(max, slot.level), 0);
}

// SRD 5.1 level-1 CREATION-time spell picks — a fixed table, not preparedSpellCountAt's ongoing ability-mod-driven cap. Three caster shapes: "known" (Bard/Sorcerer/Warlock) get a fixed personal list here, swappable per swapCadenceFor's onLevelUp cadence;
// "prepared from the full class list" (Cleric/Druid) has no personal list in PHB'14 — the WIS-mod cap governs a subset re-prepared every long rest, so 0 is the faithful creation-time count, not a placeholder;
// "spellbook" (Wizard) is served by WIZARD_LEVEL1_SPELLBOOK_SIZE below instead, since the split also has to reach EDITION_2024. Paladin/Ranger are absent: SRD 5.1 grants no Spellcasting feature at level 1 at all.
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

// Wizard's level-1 SPELLBOOK size — distinct from its PREPARED count (preparedSpellCountAt / PREPARED_SPELLS_BY_CLASS.wizard[0] === 4). The ONE place the number 6 lives — level1SpellPicksFor and levelUpSpellPicks's level<=1 branch both read it, never a second copy.
// SRD 5.1, Wizard, "Your Spellbook": a level-1 spellbook contains six 1st-level wizard spells of the player's choice. SRD 5.2 agrees; its separate Prepared Spells column (4 at level 1) is a different number.
const WIZARD_LEVEL1_SPELLBOOK_SIZE = 6;

// Folds in #1377's maxSpellLevel so reference.ts and creationSpellCountError (#1510 D4) resolve served and enforced counts through this ONE function, never two inline copies.
// null = no Spells step (non-caster, or below spellcastingStartLevel). spells: 0 = a cantrips-only step (2014 Cleric/Druid) with maxSpellLevel also 0 — never a placeholder (#1508's incoherent-shape rule applies here too).
// spellbookSize is present, and equal to spells, ONLY for Wizard, marking that its creation-pick count is the spellbook size, not the prepared cap.
export function level1SpellPicksFor(
  className: string,
  subclassRef: SubclassCasterRef | null | undefined,
  edition: RulesEdition,
): { cantrips: number; spells: number; maxSpellLevel: number; spellbookSize?: number } | null {
  if (spellcastingStartLevel(className, subclassRef, edition) > 1) return null;

  const isWizard = className.toLowerCase() === "wizard";
  let spells: number | null;
  if (isWizard) {
    spells = WIZARD_LEVEL1_SPELLBOOK_SIZE;
  } else {
    switch (edition) {
      case "EDITION_2014":
        spells = LEVEL1_CREATION_SPELLS_2014[className.toLowerCase()] ?? null;
        break;
      case "EDITION_2024":
        spells = preparedSpellCountAt(className, 1, subclassRef, {}, edition);
        break;
      default: {
        const exhaustive: never = edition;
        throw new Error(`level1SpellPicksFor: unhandled edition ${String(exhaustive)}`);
      }
    }
  }
  if (spells == null) return null;

  const cantrips = cantripsKnownAtLevel(className, 1, subclassRef);
  const maxSpellLevel = spells === 0 ? 0 : maxSpellLevelForClass(className, 1, subclassRef, edition);
  return {
    cantrips,
    spells,
    maxSpellLevel,
    ...(isWizard ? { spellbookSize: WIZARD_LEVEL1_SPELLBOOK_SIZE } : {}),
  };
}
