import { abilityAbbr, abilityLabel } from "@/lib/abilities";
import type { CatalogFeat } from "@/types/character";

export interface AbilityScorePreview {
  key: string;
  label: string;
  before: number;
  after: number;
}

// Title-case abbreviation (e.g. "Cha") derived from abilityAbbr — never from the raw key.
function abilityChipName(key: string): string {
  const abbr = abilityAbbr(key);
  return abbr[0] + abbr.slice(1).toLowerCase();
}

// Compact half-feat chip like "+1 Str, Dex or Con"; null for a full feat.
export function featAbilityChipLabel(feat: CatalogFeat): string | null {
  if (feat.abilityOptions.length === 0) return null;
  const names = feat.abilityOptions.map(abilityChipName);
  const joined =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
  return `+${feat.abilityIncrease} ${joined}`;
}

// Ordered before/after previews for each ability a half-feat may bump.
export function abilityScorePreviews(
  feat: CatalogFeat,
  currentScores: Record<string, number>,
): AbilityScorePreview[] {
  return feat.abilityOptions.map((key) => {
    const before = currentScores[key] ?? 10;
    return { key, label: abilityLabel(key), before, after: before + feat.abilityIncrease };
  });
}
