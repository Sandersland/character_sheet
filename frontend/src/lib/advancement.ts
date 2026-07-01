// Pretty-print an AdvancementEntry's mechanical effects for the list view.

import { abilityLabel, skillLabel } from "@/lib/abilities";
import type { AdvancementEntry } from "@/types/character";

export const NUMERIC_TARGET_LABELS: Record<string, string> = {
  speed: "speed",
  maxHp: "max HP",
  armorClass: "AC",
  initiative: "initiative",
};

export function entryDetail(entry: AdvancementEntry): string | undefined {
  if (entry.kind === "feat") {
    const parts: string[] = [];

    // Ability score bump (from abilityDeltas, same cascade as ASI)
    const abParts = Object.entries(entry.abilityDeltas)
      .filter(([, d]) => d !== 0)
      .map(([ab, d]) => `+${d} ${abilityLabel(ab)}`);
    if (abParts.length) parts.push(...abParts);

    // Numeric stat bonuses from improvements
    const numeric = (entry.improvements ?? []).filter((imp) => imp.target in NUMERIC_TARGET_LABELS);
    for (const imp of numeric) {
      const label = NUMERIC_TARGET_LABELS[imp.target];
      parts.push(`+${imp.amount}${imp.perLevel ? "/level" : ""} ${label}`);
    }

    // Skill proficiencies
    const skills = (entry.improvements ?? [])
      .filter((imp) => imp.target === "skillProficiency" && imp.key)
      .map((imp) => skillLabel(imp.key as string));
    if (skills.length) parts.push(`Prof: ${skills.join(", ")}`);

    // Saving throw proficiencies
    const saves = (entry.improvements ?? [])
      .filter((imp) => imp.target === "savingThrowProficiency" && imp.key)
      .map((imp) => abilityLabel(imp.key as string));
    if (saves.length) parts.push(`Save prof: ${saves.join(", ")}`);

    if (parts.length) return parts.join(" · ");
    // Fall back to description if no improvements to summarize
    return entry.featDescription ?? undefined;
  }
  if (entry.kind === "asi") {
    const parts: string[] = [];
    if (entry.hpDelta > 0) parts.push(`+${entry.hpDelta} max HP`);
    if (entry.initDelta > 0) parts.push(`+${entry.initDelta} initiative`);
    return parts.length > 0 ? parts.join(", ") : undefined;
  }
  return undefined;
}
