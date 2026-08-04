import type { RulesEdition } from "@character-sheet/shared-types";

// PHB'24 moved two mechanics onto Background: a free Origin feat at level 1
// and a +2/+1 (or +1/+1/+1) ability-score spread across three named abilities.
// Neither exists in PHB'14 — 2014 feats are optional, taken only in place of an
// ASI starting at level 4 (PHB'14 p. 165), and 2014 ability increases come from
// race, not background. Every seeded background/feat row carries `edition:
// null` or is shared by name, so nothing upstream of these two calls stops a
// 2014 character from resolving 2024 grants — one function per grant, `edition`
// last, the `subclassGateLevel` house style — called from both the creation
// path (character-create.ts) and the /api/reference preview (reference.ts) so
// the two cannot disagree.

/** Whether this edition's backgrounds grant a free Origin feat (PHB'24 only). */
export function backgroundGrantsOriginFeat(edition: RulesEdition): boolean {
  return edition === "EDITION_2024";
}

/** Whether this edition's backgrounds grant an ability-score spread (PHB'24 only). */
export function backgroundGrantsAbilitySpread(edition: RulesEdition): boolean {
  return edition === "EDITION_2024";
}
