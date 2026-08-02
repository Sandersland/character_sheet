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
// Postgres makes no ordering guarantee absent an explicit `orderBy` — without
// one, two rows at the same level (e.g. Second Wind/Action Surge, both L1)
// come back in unspecified order, so pools/actions built from these rows
// (poolsFromRows, actionsFromRows) would nondeterministically swap position
// on every read. `level` then `name` gives a stable, content-derived order
// with no dependency on insertion order.
//
// `edition` sorts LAST and only breaks ties `(level, name)` leaves — the query
// deliberately loads BOTH editions, and a class's two edition rows for one
// feature share a level and a name (Fighter has five such pairs: Fighting
// Style L1, Second Wind L1, Action Surge L2, Extra Attack L5, Indomitable L9).
// Those ties are unobservable downstream TODAY because every consumer
// edition-filters before reading position, so exactly one of each pair
// survives; the key exists so totality stops depending on that invariant
// holding forever, and sorting it last is what keeps each edition's surviving
// subsequence byte-identical to before (#1545, #1528). Total, not merely
// "more total": `@@unique([classId, subclassId, name, edition])` makes
// `(level, name, edition)` unique within either relation.
//
// Gotcha: `edition` is a Postgres enum, so `asc` sorts by DECLARATION order in
// schema.prisma — EDITION_2014 then EDITION_2024 — not lexicographically. They
// coincide today; an edition declared out of alphabetical order would not.
export const FEATURE_ROWS_ORDER_BY = [{ level: "asc" }, { name: "asc" }, { edition: "asc" }] satisfies Prisma.ClassFeatureOrderByWithRelationInput[];

/**
 * The `class.features` relation argument, for the six selects that reach a
 * class's OWN feature rows. `subclassId: null` is load-bearing:
 * ClassFeature.classId is required on subclass rows too, so an unfiltered
 * `class.features` returns every subclass under this class (a Fighter would
 * list Champion + Battle Master + Eldritch Knight together).
 *
 * Relation-level rather than folded into FEATURE_ROWS_ENTRY_SELECT because
 * three call sites cannot spread the entry-level fragment at all — they
 * declare their own differently-shaped `class` (see ClassEntryRow) and TS's
 * weak-type check rejects the assignment. Spreading the outer `class` key is
 * what collides; naming the inner relation argument is not, so this is the one
 * shape all twelve sites CAN share (#1545).
 */
export const FEATURE_ROWS_CLASS_FEATURES = {
  where: { subclassId: null },
  orderBy: FEATURE_ROWS_ORDER_BY,
} satisfies Prisma.CharacterClass$featuresArgs;

/**
 * The `subclassRef.features` twin — already scoped by the Subclass.features
 * back-relation, so it needs the order but no filter.
 */
export const FEATURE_ROWS_SUBCLASS_FEATURES = {
  orderBy: FEATURE_ROWS_ORDER_BY,
} satisfies Prisma.Subclass$featuresArgs;

export const FEATURE_ROWS_ENTRY_SELECT = {
  // subclassLevel rides along because this select already reaches the class
  // relation: it is the seeded PHB'14 subclass grant level isSubclassActive
  // needs to stop depending on a lib/classes/<class>.ts module (#1576), and
  // adding it here means every caller already spreading this fragment gets it
  // without editing its own select.
  class: {
    select: { subclassLevel: true, features: FEATURE_ROWS_CLASS_FEATURES },
  },
  subclassRef: { select: { features: FEATURE_ROWS_SUBCLASS_FEATURES } },
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
    subclassLevel: entry.class?.subclassLevel,
  };
}
