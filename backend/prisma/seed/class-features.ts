// --- ClassFeature catalog (#1522/#1523) --------------------------------------
// Migrates the per-class DerivedFeature[] text that lived in twelve
// lib/classes/<class>.ts modules into seeded ClassFeature rows — no rules
// content changes here, a mechanical move with a checkable row count. Reading
// these rows (retiring featureAppliesToEdition) is #1524's job, not this
// file's; every descriptor column below is populated nowhere yet (#1528+).
//
// Rows are DERIVED from the twelve class modules, not hand-transcribed: this
// guarantees byte-identical `description`/`level` text (the migration's own
// acceptance criterion) and means the row count is a property of the
// registry, never a literal to keep in sync by hand.
//
// DATA MODULE ONLY (#1277 AC 4, machine-enforced by
// scripts/check-seed-data-modules.sh): no direct database calls or async
// write logic may live in this file. The executable seeder is
// seed-class-features.ts — the same content/logic split spells.ts /
// rename-spells.ts already establishes, one level up from the issue's
// original filing (which named this single file for both the rows AND the
// exported seeder function; corrected here to keep the pre-existing gate
// green rather than adding a bespoke exception whose file also holds data).
import { z } from "zod";

import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { AuthoredFeature, ClassDefinition } from "../../src/lib/classes/types.js";
import type { SeedEdition } from "./edition.js";

import { barbarian } from "../../src/lib/classes/barbarian.js";
import { bard } from "../../src/lib/classes/bard.js";
import { cleric } from "../../src/lib/classes/cleric.js";
import { druid } from "../../src/lib/classes/druid.js";
import { fighter } from "../../src/lib/classes/fighter.js";
import { monk } from "../../src/lib/classes/monk.js";
import { paladin } from "../../src/lib/classes/paladin.js";
import { ranger } from "../../src/lib/classes/ranger.js";
import { rogue } from "../../src/lib/classes/rogue.js";
import { sorcerer } from "../../src/lib/classes/sorcerer.js";
import { warlock } from "../../src/lib/classes/warlock.js";
import { wizard } from "../../src/lib/classes/wizard.js";

// className must match a CharacterClass.name seed row (catalog-data.ts) —
// title case, not the lowercase registry.ts dispatch key.
const CLASS_MODULES: Record<string, ClassDefinition> = {
  Barbarian: barbarian,
  Bard: bard,
  Cleric: cleric,
  Druid: druid,
  Fighter: fighter,
  Monk: monk,
  Paladin: paladin,
  Ranger: ranger,
  Rogue: rogue,
  Sorcerer: sorcerer,
  Warlock: warlock,
  Wizard: wizard,
};

// One entry per DerivedFeature exactly as authored in lib/classes/<class>.ts —
// pre-expansion (an untagged feature is still ONE entry here; expandFeatureRow
// below is what turns it into two DB rows). subclassSlug comes straight off
// SubclassDefinition.slug — the same field the seeded Subclass row's `slug`
// column must equal — rather than a second SUBCLASS_IDENTITY lookup: reading
// the authoritative field directly can't drift out of sync with itself the
// way a redundant (classKey, nameKey) -> slug re-derivation could. Internal
// (not exported): CLASS_FEATURES below is the derived artifact tests and
// production code both consume; this is only its intermediate step.
interface RawFeatureRow {
  className: string;
  subclassSlug: SubclassSlug | null;
  feature: AuthoredFeature;
}

// Split from collectRawFeatures purely to keep each function's cyclomatic
// complexity low (prisma/seed/** carries no vitest coverage instrumentation —
// vitest.config.ts's coverage.include is scoped to src/**/*.ts — so a function
// here floors at the UNCOVERED CRAP formula CC^2+CC regardless of how
// thoroughly class-feature-migration.test.ts exercises it; splitting the
// branches down is the only lever, not adding coverage).
function baseFeatureRows(className: string, classDef: ClassDefinition): RawFeatureRow[] {
  return classDef.features.map((feature) => ({ className, subclassSlug: null, feature }));
}

function subclassFeatureRows(className: string, classDef: ClassDefinition): RawFeatureRow[] {
  const rows: RawFeatureRow[] = [];
  for (const subclassDef of Object.values(classDef.subclasses ?? {})) {
    for (const feature of subclassDef.features) {
      rows.push({ className, subclassSlug: subclassDef.slug, feature });
    }
  }
  return rows;
}

function collectRawFeatures(): RawFeatureRow[] {
  const rows: RawFeatureRow[] = [];
  for (const [className, classDef] of Object.entries(CLASS_MODULES)) {
    rows.push(...baseFeatureRows(className, classDef), ...subclassFeatureRows(className, classDef));
  }
  return rows;
}

// The seed-authoring shape for one ClassFeature DB row. Only the identity
// fields are populated by this migration — every descriptor column stays at
// its NULL/default reset value (#1522 decision 3's "authored once, populated
// nowhere" scope — the reset payload itself lives in seed-class-features.ts,
// the logic module, since it's part of the WRITE, not the row's identity).
// `edition` is REQUIRED (not optional): unlike every other edition-tagged seed
// row (SubclassSeed, ActionSeed, ManeuverSeed, ...), a ClassFeatureSeedRow has
// already been split one-per-edition by expandFeatureRow below — there is no
// "omitted = shared" case left by the time a row reaches this shape,
// mirroring the DB column's own non-nullability.
export interface ClassFeatureSeedRow {
  className: string;
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  edition: SeedEdition;
}

// Untagged (feature.edition undefined, #1522's ~256-row default) -> two rows,
// one per edition, IDENTICAL text. Already-tagged (the 10 pre-forked rows:
// Cleric Domain Spells x2, Warlock Expanded Spell List x3) -> exactly the one
// row its tag names — never duplicated, since it is already a genuine fork.
function expandFeatureRow(raw: RawFeatureRow): ClassFeatureSeedRow[] {
  const base = {
    className: raw.className,
    subclassSlug: raw.subclassSlug,
    name: raw.feature.name,
    level: raw.feature.level,
    description: raw.feature.description,
  };
  const editions: SeedEdition[] = raw.feature.edition ? [raw.feature.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

// The 522-row seed family: 256 untagged x 2 editions + 10 already-forked = 522
// (re-derived from the registry by class-feature-migration.test.ts, never
// hardcoded there either).
export const CLASS_FEATURES: ClassFeatureSeedRow[] = collectRawFeatures().flatMap(expandFeatureRow);

// Shared ascending-by-minLevel invariant (#1522 decision: tier arrays are
// ASCENDING, last-match-wins — settled here because the two shapes being
// merged disagreed: EXTRA_ATTACK_TIERS is descending/first-match while
// #1522's resourceTotals example is ascending). Each concrete tier schema
// below stays a plain (non-generic) zod object — a generic factory spreading
// a type parameter into z.object's shape defeats TS's inference of the merged
// shape (verified: `minLevel` becomes unreachable through the resulting
// conditional type) — but all three `.refine` the SAME predicate, so the
// invariant itself has exactly one definition.
function isAscendingByMinLevel(tiers: { minLevel: number }[]): boolean {
  return tiers.every((tier, i) => i === 0 || tier.minLevel > tiers[i - 1].minLevel);
}

const ASCENDING_TIER_MESSAGE = { message: "tier array must be strictly ascending by minLevel" };

// Authored now, for #1528/#1530 to reuse when they first populate
// resourceTotals/resourceDieTiers/derivedStatTiers — this stage's own rows
// never set them (seed-class-features.ts always writes Prisma.DbNull), so no
// production import of these three exists until #1528/#1530 land. Not
// exported: classFeatureSeedSchema (below) is the surface anything outside
// this file — including class-feature-tier-schema.test.ts — should validate
// against, since that's the schema that actually ships. Exporting these three
// individually would let a caller bypass classFeatureSeedSchema's other
// fields and required an unused-export lint suppression on all three purely
// because #1528/#1530 hadn't landed yet — un-exporting removes both problems
// at once.
const resourceTotalsTierSchema = z
  .array(z.object({ minLevel: z.number().int().positive(), total: z.number().int().nonnegative() }))
  .refine(isAscendingByMinLevel, ASCENDING_TIER_MESSAGE);
const resourceDieTiersSchema = z
  .array(z.object({ minLevel: z.number().int().positive(), die: z.string().min(1) }))
  .refine(isAscendingByMinLevel, ASCENDING_TIER_MESSAGE);
const derivedStatTiersSchema = z
  .array(z.object({ minLevel: z.number().int().positive(), value: z.union([z.number(), z.string()]) }))
  .refine(isAscendingByMinLevel, ASCENDING_TIER_MESSAGE);

// Validated at seed time (prisma/seed/validate.ts). Only the identity fields
// this migration actually populates are required; the descriptor fields are
// declared (using the tier schemas above) so a future population pass is
// validated by the SAME schema, not a second one authored later.
export const classFeatureSeedSchema = z.object({
  className: z.string().min(1),
  subclassSlug: z.enum(SUBCLASS_SLUGS).nullable(),
  name: z.string().min(1),
  level: z.number().int().positive(),
  description: z.string().min(1),
  edition: z.enum(["EDITION_2014", "EDITION_2024"]),
  resourceTotals: resourceTotalsTierSchema.nullable().optional(),
  resourceDieTiers: resourceDieTiersSchema.nullable().optional(),
  derivedStatTiers: derivedStatTiersSchema.nullable().optional(),
});
