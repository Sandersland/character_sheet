// #1524: reads seeded ClassFeature rows (#1522/#1523) into DerivedFeature[] —
// the read-time counterpart to prisma/seed/class-features.ts's write-time
// expandFeatureRow. A structural row type (no Prisma import) keeps this a
// pure leaf, same as lib/spellcasting/granted-spells.ts's GrantedSpellSource
// pattern: the caller loads the relation (characterInclude,
// lib/character/character-include.ts) and hands the plain rows in — nothing
// here ever touches the database.
import type { RulesEdition } from "@character-sheet/shared-types";

import type { DerivedFeature } from "./types.js";

/**
 * The subset of a seeded ClassFeature row featuresFromRows needs. classId/
 * subclassId are the caller's join (characterInclude's `class`/`subclassRef`
 * relations already scope a row's partition — see class-feature-rows.test.ts's
 * no-Prisma-import assertion for why this file doesn't re-derive that split).
 */
export interface ClassFeatureRow {
  name: string;
  level: number;
  description: string;
  edition: RulesEdition;
}

/**
 * Both halves of one class/subclass pairing's loaded feature rows — the
 * `deriveResources` carrier (#1524). `classRows` is already `subclassId: null`
 * filtered by the caller's include (characterInclude); `subclassRows` is
 * whatever the active subclass's own `features` relation loaded. Optional at
 * every call site through deriveEntryScopedResources' widened classEntries
 * element type (registry.ts) so the five narrow-select callers (maneuvers.ts,
 * focus-cast.ts, channel-divinity.ts, rest.ts, level-reconciliation.ts) keep
 * compiling unedited — none of them read `.features`.
 */
export interface ClassFeatureRowsCarrier {
  classRows: ClassFeatureRow[];
  subclassRows: ClassFeatureRow[];
}

/**
 * The ONE place the edition rule for feature TEXT lives (#1374) — retired
 * from featureAppliesToEdition (registry.ts, #1524) onto seeded rows instead
 * of in-memory DerivedFeature literals. A row already names its one edition
 * (ClassFeature.edition is non-nullable, #1522 decision 3), so this filters
 * rather than defaults-to-both: a row whose edition doesn't match is simply
 * absent from the carrier's other edition, never merged in and never
 * defaulted. Filtering here — on the way OUT of the rows — rather than after
 * mergeLayers combines base+subclass layers is what keeps mergeLayers' dedup
 * from ever having to arbitrate between a fork's two halves (registry.ts).
 */
export function featuresFromRows(
  rows: readonly ClassFeatureRow[],
  level: number,
  source: "class" | "subclass",
  edition: RulesEdition,
): DerivedFeature[] {
  return rows
    .filter((row) => row.edition === edition && row.level <= level)
    .map((row) => ({ name: row.name, level: row.level, description: row.description, source, edition: row.edition }));
}
