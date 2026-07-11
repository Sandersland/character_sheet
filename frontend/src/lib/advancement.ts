// Pretty-print an AdvancementEntry's mechanical effects for the list view.

import { abilityLabel, skillLabel } from "@/lib/abilities";
import type { AdvancementEntry, FeatImprovement } from "@/types/character";

export const NUMERIC_TARGET_LABELS: Record<string, string> = {
  speed: "speed",
  maxHp: "max HP",
  armorClass: "AC",
  initiative: "initiative",
};

// Ability score bumps (from abilityDeltas, same cascade as ASI): "+2 Strength".
function abilityBumpParts(abilityDeltas: AdvancementEntry["abilityDeltas"]): string[] {
  return Object.entries(abilityDeltas)
    .filter(([, d]) => d !== 0)
    .map(([ab, d]) => `+${d} ${abilityLabel(ab)}`);
}

// Numeric stat bonuses from improvements: "+1/level max HP".
function numericBonusParts(improvements: FeatImprovement[]): string[] {
  return improvements
    .filter((imp) => imp.target in NUMERIC_TARGET_LABELS)
    .map((imp) => `+${imp.amount}${imp.perLevel ? "/level" : ""} ${NUMERIC_TARGET_LABELS[imp.target]}`);
}

// Proficiency labels for a given improvement target, resolved via `labelFor`.
function profLabels(
  improvements: FeatImprovement[],
  target: FeatImprovement["target"],
  labelFor: (key: string) => string,
): string[] {
  return improvements.filter((imp) => imp.target === target && imp.key).map((imp) => labelFor(imp.key as string));
}

function featDetail(entry: AdvancementEntry): string | undefined {
  const improvements = entry.improvements ?? [];
  const parts = [...abilityBumpParts(entry.abilityDeltas), ...numericBonusParts(improvements)];

  const skills = profLabels(improvements, "skillProficiency", skillLabel);
  if (skills.length) parts.push(`Prof: ${skills.join(", ")}`);

  const saves = profLabels(improvements, "savingThrowProficiency", abilityLabel);
  if (saves.length) parts.push(`Save prof: ${saves.join(", ")}`);

  // Fall back to description when there are no improvements to summarize.
  return parts.length ? parts.join(" · ") : (entry.featDescription ?? undefined);
}

function asiDetail(entry: AdvancementEntry): string | undefined {
  const parts: string[] = [];
  if (entry.hpDelta > 0) parts.push(`+${entry.hpDelta} max HP`);
  if (entry.initDelta > 0) parts.push(`+${entry.initDelta} initiative`);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

export function entryDetail(entry: AdvancementEntry): string | undefined {
  if (entry.kind === "feat") return featDetail(entry);
  if (entry.kind === "asi") return asiDetail(entry);
  return undefined;
}
