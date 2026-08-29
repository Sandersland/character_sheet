// Single-sourced so reconcile-on-write and clamp-on-read compute the same limit.

import type { RulesEdition } from "@character-sheet/shared-types";

// Single-class: the XP-derived total is authoritative (the per-class `level` column can be stale, self-healed lazily by HP level-up). Multiclass: use each entry's own level.
export function effectiveEntryLevel(entryLevel: number, entryCount: number, derivedLevel: number): number {
  return entryCount <= 1 ? derivedLevel : entryLevel;
}

// #124's LIFO trim: highest-position (most-recently-added) class loses levels first; position-0 floors at 1, every other entry at 0. Input ordered by position ascending.
// The one allocation both reconcileClassEntryLevels and computeLevelDownState (#1123) resolve through — never two inline copies of the trim.
export function levelDownEntryLevels(
  entryLevels: readonly number[],
  newDerivedLevel: number,
): number[] {
  const result = [...entryLevels];
  let excess = result.reduce((sum, level) => sum + level, 0) - newDerivedLevel;
  for (let i = result.length - 1; i >= 0 && excess > 0; i--) {
    const floor = i === 0 ? 1 : 0;
    const reducible = Math.min(result[i] - floor, excess);
    if (reducible <= 0) continue;
    result[i] -= reducible;
    excess -= reducible;
  }
  return result;
}

// SRD 5.2: every class gains its subclass at level 3 (catalog column ignored).
// PHB'14: the catalog column carries the per-class gate — Cleric/Sorcerer/Warlock 1, Druid/Wizard 2, rest 3.
// CharacterClass.subclassLevel (#1308) is a 2014-only field: the reconciler in level-reconciliation.ts and the clamp-on-read in serialize/classes.ts both resolve through this one function.
// #1527 pattern-setter: `switch` + `assertNever` default, never an if/else — an if/else lets an unrecognized edition silently fall into 2014's branch.
export function subclassGateLevel(
  subclassLevel: number | null | undefined,
  edition: RulesEdition,
): number {
  switch (edition) {
    case "EDITION_2024":
      return 3;
    case "EDITION_2014":
      return subclassLevel ?? 3;
    default: {
      const exhaustive: never = edition;
      throw new Error(`subclassGateLevel: unhandled edition ${String(exhaustive)}`);
    }
  }
}

export function subclassActiveAt(
  effectiveLevel: number,
  subclassLevel: number | null | undefined,
  edition: RulesEdition,
): boolean {
  return effectiveLevel >= subclassGateLevel(subclassLevel, edition);
}
