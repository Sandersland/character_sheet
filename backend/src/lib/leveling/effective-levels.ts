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
// Every seeded subclassLevel is currently 3, so both branches agree on shipped
// data; edition-tagged 2014 catalog rows are the content-tagging sub-issue's job
// (#1281). That is why the tests use a fixture class row with subclassLevel: 2.
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
