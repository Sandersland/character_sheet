import type { RulesEdition } from "@character-sheet/shared-types";

import { derivedStatFromRows, type ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";

/**
 * Weapon attacks made when taking the Attack action (Extra Attack), row-
 * driven (#1530): each class/subclass entry's OWN seeded ClassFeature rows
 * carry the progression (`derivedStat: "attacksPerAction"` + ascending
 * `derivedStatTiers`) instead of a TS Record keyed by class name
 * (EXTRA_ATTACK_TIERS, retired) — Extra Attack is a named feature with its
 * own row per (class, subclass, edition) since #1522/#1523, so its tiers now
 * live where its level already does. A subclass-gated Extra Attack (College
 * of Valor bard) is just a row with a subclassId; there is no class-name
 * branch or slug comparison left at this call site (the #1277/#1339 fix — a
 * homebrew subclass merely CONTAINING "Valor", or named exactly "College of
 * Valor" with no FK, inherited Extra Attack it never earned — becomes
 * unrepresentable rather than guarded, since such an entry's subclassRows
 * carrier is simply empty).
 *
 * Multiclass takes the MAX across entries — Extra Attack never stacks — and
 * the floor is 1: an entry with no qualifying row makes one attack. Both stay
 * explicit code with their own why here, not an accident of an empty lookup.
 * `edition` is a pure filter key (rows are per-edition, non-nullable column)
 * — never a branch: the rule itself is edition-invariant everywhere; only
 * Fighter's ROW SHAPE forks (one row in 2014, three in 2024, #1528).
 */
export function deriveAttacksPerAction<E extends { level: number }>(
  classEntries: ReadonlyArray<E>,
  edition: RulesEdition,
  getFeatureRows: (entry: E) => ClassFeatureRowsCarrier | undefined,
): number {
  let best = 1;
  for (const entry of classEntries) {
    const rows = getFeatureRows(entry);
    if (!rows) continue;
    // classRows + subclassRows combined so a base-class row (Fighter's own
    // Extra Attack) and a subclass row (College of Valor's) compose under
    // ONE max — derivedStatFromRows itself already takes the max across
    // every qualifying row, never the first match.
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
