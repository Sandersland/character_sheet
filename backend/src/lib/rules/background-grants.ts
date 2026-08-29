import type { RulesEdition } from "@character-sheet/shared-types";

// PHB'24 moves a free Origin feat and an ability-score spread onto Background; PHB'14 feats are optional from level 4 (PHB'14 p. 165) and ability increases come from race, not background.
// These grant checks are called from both the creation path and the reference preview, so one function per grant keeps the two from disagreeing.

export function backgroundGrantsOriginFeat(edition: RulesEdition): boolean {
  return edition === "EDITION_2024";
}

export function backgroundGrantsAbilitySpread(edition: RulesEdition): boolean {
  return edition === "EDITION_2024";
}

// The opposite verdict of backgroundGrantsAbilitySpread — the two mechanisms are edition-complementary, never both-on or both-off.
export function speciesGrantsAbilityIncreases(edition: RulesEdition): boolean {
  return edition === "EDITION_2014";
}

// A legal floating spread is +2/+1 or +1/+1/+1, always summing to 3.
export function floatingSpreadShapeValid(amounts: number[]): boolean {
  const sorted = [...amounts].sort((a, b) => a - b);
  const isTwoOne = sorted.length === 2 && sorted[0] === 1 && sorted[1] === 2;
  const isOneOneOne = sorted.length === 3 && sorted.every((a) => a === 1);
  return isTwoOne || isOneOneOne;
}

// Defaults an unlisted ability to 10, matching deriveCreatedCharacter's own default for an omitted ability.
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
