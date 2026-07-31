// #1528 chunk 0 — the shared feature-rows carrier every narrow character
// select needs. `deriveResources`' `featureRows` parameter was, until this
// file, only ever populated by buildResourcesView (serialize/classes.ts),
// which builds it inline from characterInclude's real relations. Every other
// call site (maneuvers.ts, resources.ts, rest.ts, level-reconciliation.ts, …)
// reached deriveResources/deriveEntryScopedResources through a narrow select
// with no `class.features` / `subclassRef.features` relation, so the carrier
// was silently `undefined` there — harmless while Fighter's pools lived in
// resourceFn (unaffected by featureRows), but NOT once Second Wind/Action
// Surge/Indomitable moved onto rows: every one of those call sites would see
// zero Fighter base pools without this fragment.
//
// One shared select fragment + one shared extractor, spread into every
// narrow select that needs it, so a classEntries row and characterInclude's
// own shape can never diverge on what a "feature row" means.
import { Prisma } from "@/generated/prisma/client.js";

import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "./class-feature-rows.js";

/**
 * Prisma select fragment for one CharacterClassEntry's two feature relations.
 * `class.features` is `subclassId: null` filtered (a class's own rows only —
 * mirrors characterInclude's own comment on why that filter is load-bearing);
 * `subclassRef.features` is already subclass-scoped by the back-relation, no
 * further filter needed. Both editions load — the in-memory per-edition
 * filter is featuresFromRows'/poolsFromRows' job, not the query's.
 */
export const FEATURE_ROWS_ENTRY_SELECT = {
  class: { select: { features: { where: { subclassId: null } } } },
  subclassRef: { select: { features: true } },
} satisfies Prisma.CharacterClassEntrySelect;

export type FeatureRowsEntry = Prisma.CharacterClassEntryGetPayload<{ select: typeof FEATURE_ROWS_ENTRY_SELECT }>;

/**
 * Extracts one entry's `ClassFeatureRowsCarrier` — the `GetFeatureRows`
 * callback every `deriveEntryScopedResources`/`deriveResources` caller with
 * `FEATURE_ROWS_ENTRY_SELECT` loaded supplies. Byte-identical to
 * buildResourcesView's own inline extractor (serialize/classes.ts) — kept as
 * one function so the two can never diverge on what a "feature row" means.
 */
export function featureRowsOf(entry: FeatureRowsEntry): ClassFeatureRowsCarrier {
  // Prisma types resourceTotals/resourceDieTiers/derivedStatTiers as opaque
  // Prisma.JsonValue (it can't know a Json column's internal shape) — cast to
  // ClassFeatureRow's specific tiered shape here, once, mirroring the
  // `abilityScores as Record<string, number>` pattern used everywhere else a
  // Json column is read as a concrete TS shape. Validated at SEED time
  // (classFeatureSeedSchema, prisma/seed/class-features.ts), not re-validated
  // on every read.
  return {
    classRows: (entry.class?.features ?? []) as unknown as ClassFeatureRow[],
    subclassRows: (entry.subclassRef?.features ?? []) as unknown as ClassFeatureRow[],
  };
}
