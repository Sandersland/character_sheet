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
//
// #1681 grew this module into the shared home for BOTH editions' creation-time
// ability-spread machinery: the background spread (2024) and species/subrace
// increases (2014) are opposite-edition mirrors of the same shape, so the
// shape validator and the apply-to-scores fold live here once rather than
// twice. #1689 extends this module again for Half-Elf/High Elf's non-ability
// species choices — put new shared spec/validator helpers beside these, not
// in character-create.ts.

/** Whether this edition's backgrounds grant a free Origin feat (PHB'24 only). */
export function backgroundGrantsOriginFeat(edition: RulesEdition): boolean {
  return edition === "EDITION_2024";
}

/** Whether this edition's backgrounds grant an ability-score spread (PHB'24 only). */
export function backgroundGrantsAbilitySpread(edition: RulesEdition): boolean {
  return edition === "EDITION_2024";
}

/** Whether this edition's species/subraces grant fixed/choice ability
 *  increases (PHB'14 only) — the opposite verdict of backgroundGrantsAbilitySpread
 *  above, proving the two mechanisms are edition-complementary, not coincidentally
 *  both-on or both-off (pinned by a negative test in both directions). */
export function speciesGrantsAbilityIncreases(edition: RulesEdition): boolean {
  return edition === "EDITION_2014";
}

/**
 * A legal floating spread is +2/+1 (two abilities) or +1/+1/+1 (three) — always
 * summing to 3. Originally the PHB'24 background spread's own shape check
 * (`backgroundSpreadShapeValid`); extracted here in #1681 because a 2014
 * floating-spread species row (Astral Elf's "+2/+1-or-+1/+1/+1", seeded only
 * as a #1679 test fixture this wave) is the SAME shape, not a coincidence —
 * both are Tasha's-era "pick your own" ability spreads. Species and background
 * call sites import this one function; extending the shape (a different point
 * total) is a single edit here, not two.
 */
export function floatingSpreadShapeValid(amounts: number[]): boolean {
  const sorted = [...amounts].sort((a, b) => a - b);
  const isTwoOne = sorted.length === 2 && sorted[0] === 1 && sorted[1] === 2;
  const isOneOneOne = sorted.length === 3 && sorted.every((a) => a === 1);
  return isTwoOne || isOneOneOne;
}

/**
 * Folds a partial ability→bump map onto a base scores object, defaulting any
 * unlisted ability to 10 (matches deriveCreatedCharacter's own default for a
 * request that omits an ability). Shared by the background spread (2024) and
 * species increases (2014) bake phases in character-create.ts — both
 * fold their resolved spread into `effectiveScores` the same way, before
 * deriveCreatedCharacter runs, so HP/init/spell-cap derivation sees the result
 * for free (#1130, #1681).
 */
export function applyAbilitySpread(
  base: Record<string, number>,
  spread: Record<string, number> | undefined,
): Record<string, number> {
  const scores = { ...base };
  for (const [ability, amount] of Object.entries(spread ?? {})) {
    scores[ability] = (scores[ability] ?? 10) + amount;
  }
  return scores;
}
