import { abilityAbbr, abilityLabel } from "@/lib/abilities";
import type { CatalogFeat, Character } from "@/types/character";

// #1137: a feat's mechanical effects (e.g. Two-Weapon Fighting's
// "offhandAbilityDamage") now live in advancement improvements, not a class
// scalar. True when any taken advancement carries an improvement for `target`.
export function hasFeatImprovement(character: Character, target: string): boolean {
  return (character.advancements ?? []).some((a) => (a.improvements ?? []).some((imp) => imp.target === target));
}

// Mirror of the backend featOfferedForAsiSlot (lib/srd/feats.ts) — update both.
// Filters the ASI-slot feat picker: Origin/Fighting Style never appear; General
// unlocks at level 4 and Epic Boon at 19 unless levelPrerequisite overrides
// (PHB'24 pp. 87-88). The server gate in resolveCatalogFeat is authoritative.
export function featOfferedForAsiSlot(
  feat: Pick<CatalogFeat, "category" | "levelPrerequisite">,
  level: number,
): boolean {
  switch (feat.category) {
    case "origin":
    case "fighting_style":
      return false;
    case "general":
      return level >= (feat.levelPrerequisite ?? 4);
    case "epic_boon":
      return level >= (feat.levelPrerequisite ?? 19);
    default:
      return false; // unknown future category — fail safe-closed, never leak feats
  }
}

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
