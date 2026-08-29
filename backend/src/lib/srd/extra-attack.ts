import type { RulesEdition } from "@character-sheet/shared-types";

import { derivedStatFromRows, type ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";

// Multiclass takes the MAX across entries — Extra Attack never stacks — and the floor is 1. `edition` is a pure filter key; only Fighter's row shape forks by edition (#1528), never the rule itself.
export function deriveAttacksPerAction<E extends { level: number }>(
  classEntries: ReadonlyArray<E>,
  edition: RulesEdition,
  getFeatureRows: (entry: E) => ClassFeatureRowsCarrier | undefined,
): number {
  let best = 1;
  for (const entry of classEntries) {
    const rows = getFeatureRows(entry);
    if (!rows) continue;
    // classRows + subclassRows combine under ONE max — derivedStatFromRows already takes the max across every qualifying row, never the first match.
    const value = derivedStatFromRows(
      [...rows.classRows, ...rows.subclassRows],
      entry.level,
      edition,
      "attacksPerAction",
    );
    if (value !== undefined) best = Math.max(best, value);
  }
  return best;
}
