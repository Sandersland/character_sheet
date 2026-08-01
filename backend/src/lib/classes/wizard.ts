// #1234 commit 1: Wizard's FEATURE TEXT (base + all three schools) moved off
// this file's old AuthoredFeature[] arrays into literal seed data
// (prisma/seed/wizard-features.ts) — same shape as Fighter's (#1227/#1532)
// and Barbarian's (#1223) own migrations. Unlike those two, this module is
// NOT deletable: `isSubclassActive` resolves `subclassActiveAt(level,
// def.grantLevel, edition)`, and `subclassGateLevel`'s undefined-grantLevel
// fallback is 3 for 2014 (lib/leveling/effective-levels.ts) — but PHB'14
// p.114 gates Arcane Tradition at 2nd level, not 3rd. `SUBCLASSES` is seeded
// identity-only from SUBCLASS_IDENTITY (`{ slug }`, no `grantLevel`,
// registry.ts) and then overlaid by THIS module's ClassDefinition — deleting
// it would silently move every 2014 Wizard's subclass gate to 3, leaving a
// level-2 2014 Wizard with a subclass NAME (from the seeded
// CharacterClass.subclassLevel) and ZERO subclass FEATURES, the split-brain
// shape #1291 closed. Tracked for removal by #1576, once the 2014 gate moves
// onto data for every non-3-grantLevel class at once (see registry.ts's own
// SUBCLASSES comment). `wizard` stays in scripts/check-class-ts-migration.sh's
// NOT_YET_MIGRATED for the same reason.
import type { ClassDefinition } from "./types.js";

// #1234 commit 3: both resourceFns that used to live here (Arcane Recovery's
// once-per-day pool, #904; Illusory Self's level-10-gated pool) are deleted —
// their totals/recharge/gate now live on wizard-features.ts's own rows
// (resourceKey/resourceLabel/resourceRecharge/resourceTotals), read through
// poolsFromRows exactly like every other row-driven pool. A resourceFn pool
// wins over a row pool of the same key (mergePoolSources, registry.ts), so
// deleting both here in the SAME commit that populates the row columns is
// required — the row would otherwise stay inert.
export const wizard: ClassDefinition = {
  // PHB'14 p.114: Arcane Tradition (Wizard's subclass) is chosen at 2nd level.
  subclasses: {
    "school of evocation": { slug: "wizard-school-of-evocation", grantLevel: 2 },
    "school of abjuration": { slug: "wizard-school-of-abjuration", grantLevel: 2 },
    "school of illusion": { slug: "wizard-school-of-illusion", grantLevel: 2 },
  },
};
