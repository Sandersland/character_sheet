// Seed-time content validation (#1277). Malformed catalog content fails the
// seed with a row-indexed message instead of writing a broken row that only
// 500s later at read time (the #1247/#1370 failure class this closes for the
// families registered here). Composes zod schemas that live co-located with
// their content (subclasses.ts's subclassSeedSchema, subclass-granted-
// spells.ts's twin) rather than one central schema file, so a family's schema
// changes in the same diff as its content shape.
//
// SEED_FAMILIES is a registry, not a hardcoded list of calls — adding a
// family is one entry here, demonstrated by the second member (SUBCLASS_
// GRANTED_SPELLS) landing alongside the first, not merely asserted, the third
// (CLASS_FEATURES, #1523) landing the same way, and the fourth
// (STARTING_EQUIPMENT_PACKAGES, #1533) too. Deliberately in scope for only
// these four today; the other seed families already carry structural
// coverage via seed-data.test.ts and are a named follow-up.
import { z } from "zod";

import { SUBCLASSES, subclassSeedSchema } from "./subclasses.js";
import { SUBCLASS_GRANTED_SPELLS, subclassGrantedSpellSeedSchema } from "./subclass-granted-spells.js";
import { CLASS_FEATURES, classFeatureSeedSchema } from "./class-features.js";
import {
  STARTING_EQUIPMENT_PACKAGES,
  startingEquipmentSeedSchema,
  type StartingEquipmentSeed,
  BACKGROUND_STARTING_EQUIPMENT_PACKAGES,
  backgroundStartingEquipmentSeedSchema,
} from "./starting-equipment.js";
import { ITEMS } from "./catalog-data.js";
import { PACKS } from "./packs.js";

interface SeedFamily {
  schema: z.ZodTypeAny;
  rows: readonly unknown[];
}

const SEED_FAMILIES: Record<string, SeedFamily> = {
  SUBCLASSES: { schema: subclassSeedSchema, rows: SUBCLASSES },
  SUBCLASS_GRANTED_SPELLS: { schema: subclassGrantedSpellSeedSchema, rows: SUBCLASS_GRANTED_SPELLS },
  CLASS_FEATURES: { schema: classFeatureSeedSchema, rows: CLASS_FEATURES },
  STARTING_EQUIPMENT_PACKAGES: { schema: startingEquipmentSeedSchema, rows: STARTING_EQUIPMENT_PACKAGES },
  // #1565 — the background twin, validated by the same tree shape
  // (backgroundStartingEquipmentSeedSchema) keyed by backgroundName instead
  // of className.
  BACKGROUND_STARTING_EQUIPMENT_PACKAGES: {
    schema: backgroundStartingEquipmentSeedSchema,
    rows: BACKGROUND_STARTING_EQUIPMENT_PACKAGES,
  },
};

export interface SeedValidationSummary {
  familiesChecked: number;
  rowsChecked: number;
}

// Split into one function per tree level — purely to keep each function's
// cyclomatic/cognitive complexity low: prisma/seed/** carries no coverage
// instrumentation (vitest.config.ts's coverage `include` is `src/**/*.ts`
// only), so a single triple-nested-loop version of this floors at the
// uncovered-CRAP formula regardless of real test coverage — the same reason
// collectClassPairCounts/pairCount (seed-class-features.ts) are split out.
//
// Typed against `package` alone (StartingEquipmentSeed and
// BackgroundStartingEquipmentSeed's shared ClassStartingEquipment tree, #1565)
// rather than either seed type by name, so these three walkers serve both
// families without a duplicate background-only copy.
type PackageTree = StartingEquipmentSeed["package"];
function catalogNamesInOption(option: PackageTree["groups"][number]["options"][number]): string[] {
  return (option.items ?? []).map((item) => item.catalogName);
}

function catalogNamesInGroup(group: PackageTree["groups"][number]): string[] {
  return group.options.flatMap(catalogNamesInOption);
}

// Every catalogName a STARTING_EQUIPMENT_PACKAGES/BACKGROUND_STARTING_
// EQUIPMENT_PACKAGES row references, walking the nested group -> option ->
// items tree. Pure and literal-vs-literal (#1533 [R3]): assertSeedContentValid
// runs at seed.ts:459, BEFORE seedClasses/seedItems/seedPacks, so it cannot
// query the database — it fails the seed before anything is written instead.
function collectCatalogNames(rows: readonly { package: PackageTree }[]): string[] {
  return rows.flatMap((row) => row.package.groups.flatMap(catalogNamesInGroup));
}

// resolveFixedItems (character-create.ts) looks a catalogName up against Pack
// FIRST, then Item — so a catalogName is valid if it resolves against EITHER
// catalog. All seven packs also exist as ITEMS rows today (#1533 [R4]), so an
// Item-only check would pass by luck and only diverge the first time they do.
// Exported so a test can call it against a FIXTURE row with a nonexistent
// catalogName (never the real seed content) — same "broken fixture, never
// real content" pattern subclassSeedSchema's test uses below. `familyName`
// (#1565) names the offending family in the thrown message — STARTING_
// EQUIPMENT_PACKAGES for the class family, BACKGROUND_STARTING_EQUIPMENT_
// PACKAGES for the background one — since one function now serves both.
export function assertCatalogNamesResolve(
  rows: readonly { package: PackageTree }[],
  familyName = "STARTING_EQUIPMENT_PACKAGES",
): void {
  const known = new Set<string>([...ITEMS.map((i) => i.name), ...PACKS.map((p) => p.name)]);
  for (const name of collectCatalogNames(rows)) {
    if (!known.has(name)) {
      throw new Error(`Seed content invalid — ${familyName} references unknown catalogName "${name}"`);
    }
  }
}

/**
 * Validates every registered family's rows against its schema, throwing on the
 * FIRST invalid row with its family/index/path so the failure names the
 * offender. Also enforces two cross-row invariants no per-row schema can
 * express: two SUBCLASSES rows must never share a slug (M2, #1277) — a
 * duplicate would silently collapse two subclasses' seeded content onto one
 * DB row under the new slug_edition unique index — and every
 * STARTING_EQUIPMENT_PACKAGES catalogName must resolve against ITEMS ∪ PACKS
 * (#1533 [R3]/[R4]).
 *
 * Returns a summary so a permanent test can assert this function actually
 * visited real content (families/rows counts) rather than reporting "valid"
 * vacuously — the #1370 lesson: a validator that short-circuits, has an empty
 * registry, or is `.optional()` all the way down must fail that test.
 */
export function assertSeedContentValid(): SeedValidationSummary {
  let rowsChecked = 0;
  for (const [familyName, { schema, rows }] of Object.entries(SEED_FAMILIES)) {
    rows.forEach((row, index) => {
      const result = schema.safeParse(row);
      if (!result.success) {
        const issue = result.error.issues[0];
        const path = issue.path.join(".");
        throw new Error(
          `Seed content invalid — ${familyName}[${index}]${path ? `.${path}` : ""}: ${issue.message}`,
        );
      }
      rowsChecked += 1;
    });
  }

  const rowsBySlug = new Map<string, number>();
  SUBCLASSES.forEach((sub, index) => {
    const seenAt = rowsBySlug.get(sub.slug);
    if (seenAt !== undefined) {
      throw new Error(`Seed error: duplicate subclass slug "${sub.slug}" (rows ${seenAt} and ${index})`);
    }
    rowsBySlug.set(sub.slug, index);
  });

  assertCatalogNamesResolve(STARTING_EQUIPMENT_PACKAGES);
  assertCatalogNamesResolve(BACKGROUND_STARTING_EQUIPMENT_PACKAGES, "BACKGROUND_STARTING_EQUIPMENT_PACKAGES");

  return { familiesChecked: Object.keys(SEED_FAMILIES).length, rowsChecked };
}
