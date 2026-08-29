import type { RulesEdition } from "@character-sheet/shared-types";

import { derivedStatFromRows, type ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";

// Improved Critical (L3, 19-20) / Superior Critical (L15, 18-20), identical in both editions (SRD 5.1 p.25 / SRD 5.2 p.49) — edition here only filters ClassFeature rows, the crit-range rule itself doesn't fork.
// Lower is wider (smaller threshold crits on more rolls) — takes the MIN, unlike deriveAttacksPerAction's MAX. Floor is 20 (no qualifying row), never 1.
// Multiclass keys off each entry's own level, not total character level (#1070).
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
