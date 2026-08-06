import type { RulesEdition } from "@character-sheet/shared-types";

import { derivedStatFromRows, type ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";

/**
 * Weapon-attack crit range (#1120): default 20; Champion's Improved Critical
 * (L3) widens it to 19-20, Superior Critical (L15) to 18-20 — SRD 5.1 p.25 /
 * SRD 5.2 p.49, identical level and threshold in both editions, so — unlike
 * `edition`-forked rules — this function takes NO `edition` parameter
 * (CLAUDE.md's no-fork-when-they-agree rule); `edition` is threaded through
 * only as the row filter every derivedStat reader already takes.
 *
 * Row-driven like deriveAttacksPerAction: both tiers ride the "Improved
 * Critical" row's own derivedStatTiers (fighter-features.ts), ASCENDING by
 * minLevel, last-match-wins. "Superior Critical" is a text-only row with no
 * derivedStat of its own — the same shape Battle Master's "Improved Combat
 * Superiority (d10)/(d12)" rows use for their die-size bump, which also rides
 * entirely on Combat Superiority's own resourceDieTiers rather than a second
 * row's derivedStat. Gated through resolveSubclassSlug at seed time (the FK
 * on the ClassFeature row), never a subclass-name literal at read time.
 *
 * Lower is WIDER (a smaller threshold crits on more rolls), so this takes the
 * MIN across qualifying entries/rows — deriveAttacksPerAction's MAX would
 * pick the narrower (worse) range if a character ever had two independent
 * crit-range sources. The floor is 20 (no qualifying row), never 1.
 *
 * Multiclass keys off each entry's OWN `level` (a Champion at fighter-entry
 * level 2 stays at 20 even in a 20th-level multiclass character, #1070) —
 * the same per-entry contract deriveAttacksPerAction already uses.
 */
export function deriveCritRange<E extends { level: number }>(
  classEntries: ReadonlyArray<E>,
  edition: RulesEdition,
  getFeatureRows: (entry: E) => ClassFeatureRowsCarrier | undefined,
): number {
  let best = 20;
  for (const entry of classEntries) {
    const rows = getFeatureRows(entry);
    if (!rows) continue;
    const value = derivedStatFromRows([...rows.classRows, ...rows.subclassRows], entry.level, edition, "critRange");
    if (value !== undefined) best = Math.min(best, value);
  }
  return best;
}
