// Shared level-gating policy leaves — single-sourced so reconcile-on-write and
// clamp-on-read compute the same limit (pure, type-only imports → no cycles).

import type { RulesEdition } from "@character-sheet/shared-types";

// Single-class: the XP-derived total is authoritative (the per-class `level`
// column can be stale, self-healed lazily by HP level-up). Multiclass: use each
// entry's own level.
export function effectiveEntryLevel(entryLevel: number, entryCount: number, derivedLevel: number): number {
  return entryCount <= 1 ? derivedLevel : entryLevel;
}

// A subclass's grant gate. 2024 (SRD 5.2): every class gains its subclass at
// level 3, so the catalog column is ignored. 2014 (PHB'14): the catalog column
// carries the per-class gate — Cleric/Sorcerer/Warlock 1, Druid/Wizard 2, rest 3.
//
// CharacterClass.subclassLevel is seeded with the 2014 values (#1308) — it is a
// 2014-only field, read by no other rule. Do not repurpose or edition-tag it:
// changing what it holds changes this function's 2014 branch for every caller
// (the reconciler in level-reconciliation.ts and the clamp-on-read in
// serialize/classes.ts alike), which is exactly the coupling this function
// exists to centralize.
export function subclassGateLevel(
  subclassLevel: number | null | undefined,
  edition: RulesEdition,
): number {
  if (edition === "EDITION_2024") return 3;
  return subclassLevel ?? 3;
}

// Whether a subclass's level-gated grants are active at this effective level.
export function subclassActiveAt(
  effectiveLevel: number,
  subclassLevel: number | null | undefined,
  edition: RulesEdition,
): boolean {
  return effectiveLevel >= subclassGateLevel(subclassLevel, edition);
}
