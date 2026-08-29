// Every narrow character select that reaches deriveResources/deriveEntryScopedResources must spread this fragment — without it, featureRows silently resolves to empty and any class feature that lives on a ClassFeature row (not resourceFn) reads as zero.
import { Prisma } from "@/generated/prisma/client.js";

import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "./class-feature-rows.js";

// class.features is subclassId: null filtered (a class's own rows only, mirrors characterInclude's own filter); subclassRef.features is already subclass-scoped by its back-relation.
// Both editions load here — per-edition filtering is featuresFromRows'/poolsFromRows' job, not this query's.
// Without an explicit orderBy, two rows at the same level would come back in unspecified order — `(level, name)` gives a stable, content-derived order.
// `edition` sorts last, only breaking ties (level, name) leaves — `@@unique([classId, subclassId, name, edition])` makes (level, name, edition) unique per relation, so this ordering is total.
// Gotcha: `edition` is a Postgres enum, so `asc` sorts by DECLARATION order in schema.prisma (EDITION_2014 then EDITION_2024), not lexicographically.
export const FEATURE_ROWS_ORDER_BY = [{ level: "asc" }, { name: "asc" }, { edition: "asc" }] satisfies Prisma.ClassFeatureOrderByWithRelationInput[];

// subclassId: null is load-bearing — ClassFeature.classId is required on subclass rows too, so unfiltered class.features would return every subclass under this class.
// Kept relation-level (not folded into FEATURE_ROWS_ENTRY_SELECT) because some callers declare a differently-shaped `class` and can't spread the entry-level fragment — naming the inner relation argument is what all callers CAN share.
export const FEATURE_ROWS_CLASS_FEATURES = {
  where: { subclassId: null },
  orderBy: FEATURE_ROWS_ORDER_BY,
} satisfies Prisma.CharacterClass$featuresArgs;

// Already scoped by the Subclass.features back-relation — no filter needed, just the order.
export const FEATURE_ROWS_SUBCLASS_FEATURES = {
  orderBy: FEATURE_ROWS_ORDER_BY,
} satisfies Prisma.Subclass$featuresArgs;

export const FEATURE_ROWS_ENTRY_SELECT = {
  // subclassLevel rides along because this select already reaches the class relation — it's what isSubclassActive needs to avoid depending on a lib/classes/<class>.ts module.
  class: {
    select: { subclassLevel: true, features: FEATURE_ROWS_CLASS_FEATURES },
  },
  subclassRef: { select: { features: FEATURE_ROWS_SUBCLASS_FEATURES } },
} satisfies Prisma.CharacterClassEntrySelect;

export type FeatureRowsEntry = Prisma.CharacterClassEntryGetPayload<{ select: typeof FEATURE_ROWS_ENTRY_SELECT }>;

// Byte-identical to buildResourcesView's own inline extractor — kept as one function so the two can never diverge.
export function featureRowsOf(entry: FeatureRowsEntry): ClassFeatureRowsCarrier {
  // Cast to ClassFeatureRow's tiered shape once here (mirrors the abilityScores-as-Record pattern) — validated at seed time (classFeatureSeedSchema), not re-validated on read.
  return {
    classRows: (entry.class?.features ?? []) as unknown as ClassFeatureRow[],
    subclassRows: (entry.subclassRef?.features ?? []) as unknown as ClassFeatureRow[],
    subclassLevel: entry.class?.subclassLevel,
  };
}
