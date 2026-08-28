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
// (CLASS_FEATURES, #1523) landing the same way, the fourth
// (STARTING_EQUIPMENT_PACKAGES, #1533), and SUBCLASS_SPELL_LIST_EXPANSIONS
// (#1631, SUBCLASS_GRANTED_SPELLS' sibling family) too. The other seed
// families already carry structural coverage via seed-data.test.ts and are a
// named follow-up.
import { z } from "zod";

import { SUBCLASSES, subclassSeedSchema } from "./subclasses.js";
import { SUBCLASS_GRANTED_SPELLS, subclassGrantedSpellSeedSchema } from "./subclass-granted-spells.js";
import { SUBCLASS_SPELL_LIST_EXPANSIONS, subclassSpellListExpansionSeedSchema } from "./subclass-spell-list-expansions.js";
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
import { SPECIES, speciesSeedSchema } from "./species-data.js";
import { SPECIES_TRAITS, speciesTraitSeedSchema } from "./species-traits-data.js";
import { SPECIES_GRANTED_SPELLS, speciesGrantedSpellSeedSchema } from "./species-granted-spells-data.js";
import { SPELLS } from "./spells.js";

interface SeedFamily {
  schema: z.ZodTypeAny;
  rows: readonly unknown[];
}

const SEED_FAMILIES: Record<string, SeedFamily> = {
  SUBCLASSES: { schema: subclassSeedSchema, rows: SUBCLASSES },
  SUBCLASS_GRANTED_SPELLS: { schema: subclassGrantedSpellSeedSchema, rows: SUBCLASS_GRANTED_SPELLS },
  SUBCLASS_SPELL_LIST_EXPANSIONS: { schema: subclassSpellListExpansionSeedSchema, rows: SUBCLASS_SPELL_LIST_EXPANSIONS },
  CLASS_FEATURES: { schema: classFeatureSeedSchema, rows: CLASS_FEATURES },
  STARTING_EQUIPMENT_PACKAGES: { schema: startingEquipmentSeedSchema, rows: STARTING_EQUIPMENT_PACKAGES },
  // #1565 — the background twin, validated by the same tree shape
  // (backgroundStartingEquipmentSeedSchema) keyed by backgroundName instead
  // of className.
  BACKGROUND_STARTING_EQUIPMENT_PACKAGES: {
    schema: backgroundStartingEquipmentSeedSchema,
    rows: BACKGROUND_STARTING_EQUIPMENT_PACKAGES,
  },
  // #1679 — speciesSeedSchema validates the nested variants array too (each
  // SPECIES row embeds its own variants), so no separate SPECIES_VARIANTS
  // family is needed.
  SPECIES: { schema: speciesSeedSchema, rows: SPECIES },
  // #1682 — trait content; cross-referenced against SPECIES below (a
  // speciesSlug/variantSlug typo is a broken FK resolution at seed time
  // otherwise, not a zod-catchable shape error).
  SPECIES_TRAITS: { schema: speciesTraitSeedSchema, rows: SPECIES_TRAITS },
  // #1683 — 2024 lineage/legacy spell tracks; cross-referenced against SPECIES
  // (variant must exist) and SPELLS (spellName must resolve) below, the same
  // "zod catches shape, assertX catches FK typos" split as SPECIES_TRAITS.
  SPECIES_GRANTED_SPELLS: { schema: speciesGrantedSpellSeedSchema, rows: SPECIES_GRANTED_SPELLS },
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

// A variantSlug (when given) must name a real variant of its species. Split
// out of assertSpeciesTraitsResolve to keep every seed validator under the
// seed-file cyclomatic budget (CC <= 4): they run uncovered in globalSetup, so
// CRAP is complexity-driven and CC 5+ crosses the ceiling (#1682/#1679).
// Shared variant-slug resolution check for the SpeciesTrait and
// SpeciesGrantedSpell seed validators (#1682/#1683): variantSlug must name a
// real variant of its species. `context` identifies the calling row for the
// error message (e.g. "SPECIES_TRAITS[3]").
function assertVariantSlugKnown(species: (typeof SPECIES)[number], variantSlug: string, context: string): void {
  if (!(species.variants ?? []).some((v) => v.slug === variantSlug)) {
    throw new Error(
      `Seed content invalid — ${context} references unknown variant "${variantSlug}" under species "${species.slug}" (${species.edition})`,
    );
  }
}

function assertTraitVariantKnown(
  species: (typeof SPECIES)[number],
  trait: (typeof SPECIES_TRAITS)[number],
  index: number,
): void {
  if (!trait.variantSlug) return;
  assertVariantSlugKnown(species, trait.variantSlug, `SPECIES_TRAITS[${index}]`);
}

// One SPECIES_TRAITS row: its species must resolve, its variant (if any) must
// resolve, and its (species, edition, variant, name) key must be unique.
function assertSpeciesTraitRowResolves(
  trait: (typeof SPECIES_TRAITS)[number],
  index: number,
  speciesByKey: Map<string, (typeof SPECIES)[number]>,
  seen: Set<string>,
): void {
  const species = speciesByKey.get(`${trait.speciesSlug}::${trait.speciesEdition}`);
  if (!species) {
    throw new Error(
      `Seed content invalid — SPECIES_TRAITS[${index}] references unknown species "${trait.speciesSlug}" (${trait.speciesEdition})`,
    );
  }
  assertTraitVariantKnown(species, trait, index);
  const key = `${trait.speciesSlug}::${trait.speciesEdition}::${trait.variantSlug ?? "null"}::${trait.name}`;
  if (seen.has(key)) {
    throw new Error(`Seed error: duplicate species trait "${trait.name}" for target "${key}"`);
  }
  seen.add(key);
}

// Every (speciesSlug, speciesEdition) a SPECIES_TRAITS row names must resolve
// against SPECIES, and a variantSlug (when given) against that species' own
// variants — the #1682 twin of assertCatalogNamesResolve above, catching a
// typo'd slug before seedSpeciesTraits' DB-backed resolveTarget throws a much
// less specific runtime error mid-seed. Also rejects two rows sharing the
// same (speciesSlug, speciesEdition, variantSlug, name).
function assertSpeciesTraitsResolve(speciesRows: typeof SPECIES, traitRows: typeof SPECIES_TRAITS): void {
  const speciesByKey = new Map(speciesRows.map((s) => [`${s.slug}::${s.edition}`, s]));
  const seen = new Set<string>();
  traitRows.forEach((trait, index) => assertSpeciesTraitRowResolves(trait, index, speciesByKey, seen));
}

// One SPECIES_GRANTED_SPELLS row: its species must resolve, its variant must
// resolve (every row this slice is variant-level, #1683), and its spellName
// must name a real SPELLS catalog entry — the #1683 twin of
// assertSpeciesTraitRowResolves above, catching a typo'd slug/name before
// seedSpeciesGrantedSpells' DB-backed resolution throws a less specific error.
function assertSpeciesGrantedSpellRowResolves(
  grant: (typeof SPECIES_GRANTED_SPELLS)[number],
  index: number,
  speciesByKey: Map<string, (typeof SPECIES)[number]>,
  spellNames: Set<string>,
): void {
  const species = speciesByKey.get(`${grant.speciesSlug}::${grant.speciesEdition}`);
  if (!species) {
    throw new Error(
      `Seed content invalid — SPECIES_GRANTED_SPELLS[${index}] references unknown species "${grant.speciesSlug}" (${grant.speciesEdition})`,
    );
  }
  assertVariantSlugKnown(species, grant.variantSlug, `SPECIES_GRANTED_SPELLS[${index}]`);
  if (!spellNames.has(grant.spellName)) {
    throw new Error(`Seed content invalid — SPECIES_GRANTED_SPELLS[${index}] references unknown spell "${grant.spellName}"`);
  }
}

function assertSpeciesGrantedSpellsResolve(
  speciesRows: typeof SPECIES,
  grantRows: typeof SPECIES_GRANTED_SPELLS,
  spellRows: typeof SPELLS,
): void {
  const speciesByKey = new Map(speciesRows.map((s) => [`${s.slug}::${s.edition}`, s]));
  const spellNames = new Set(spellRows.map((s) => s.name));
  grantRows.forEach((grant, index) => assertSpeciesGrantedSpellRowResolves(grant, index, speciesByKey, spellNames));
}

// #906: poolsFromRows' inbound-subclass override (class-feature-rows.ts's
// findOverrideRow) picks its target via the FIRST matching row — two
// pool-declaring rows sharing (class, subclass, resourceKey, edition) would
// let seed content ORDER silently decide which one wins, an ambiguity no
// per-row schema can catch. "Pool-declaring" means resourceTotals is
// populated — an identity-only resourceKey (Metamagic's own pattern, #1909)
// never contends here, matching findOverrideRow's own resourceTotals?.length
// guard.
export function assertNoDuplicatePoolDeclaringRows(
  rows: readonly { className: string; subclassSlug: string | null; edition: string; resourceKey?: string | null; resourceTotals?: unknown[] | null }[],
): void {
  const rowsByKey = new Map<string, number>();
  rows.forEach((row, index) => {
    if (!row.resourceKey || !row.resourceTotals?.length) return;
    const key = `${row.className}::${row.subclassSlug ?? "null"}::${row.resourceKey}::${row.edition}`;
    const seenAt = rowsByKey.get(key);
    if (seenAt !== undefined) {
      throw new Error(`Seed error: duplicate pool-declaring ClassFeature row for "${key}" (rows ${seenAt} and ${index})`);
    }
    rowsByKey.set(key, index);
  });
}

/**
 * Validates every registered family's rows against its schema, throwing on the
 * FIRST invalid row with its family/index/path so the failure names the
 * offender. Also enforces cross-row invariants no per-row schema can express:
 * two SUBCLASSES rows must never share a slug (M2, #1277) — a duplicate would
 * silently collapse two subclasses' seeded content onto one DB row under the
 * new slug_edition unique index — every STARTING_EQUIPMENT_PACKAGES
 * catalogName must resolve against ITEMS ∪ PACKS (#1533 [R3]/[R4]), and no two
 * CLASS_FEATURES rows may both declare the same pool (assertNoDuplicatePoolDeclaringRows above).
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
  assertNoDuplicatePoolDeclaringRows(CLASS_FEATURES);

  // #1679: no two SPECIES rows may share (slug, edition) — the same M2 role
  // as the SUBCLASSES slug check above, catching what @@unique([slug,
  // edition]) would otherwise surface as an opaque P2002 mid-seed. Nested
  // variant slugs are checked per-species, since @@unique([speciesId, slug])
  // scopes uniqueness to the parent, not the whole table.
  const rowsBySpeciesKey = new Map<string, number>();
  SPECIES.forEach((species, index) => {
    const key = `${species.slug}::${species.edition}`;
    const seenAt = rowsBySpeciesKey.get(key);
    if (seenAt !== undefined) {
      throw new Error(`Seed error: duplicate species slug "${species.slug}" (${species.edition}) (rows ${seenAt} and ${index})`);
    }
    rowsBySpeciesKey.set(key, index);

    const rowsByVariantSlug = new Map<string, number>();
    (species.variants ?? []).forEach((variant, variantIndex) => {
      const seenVariantAt = rowsByVariantSlug.get(variant.slug);
      if (seenVariantAt !== undefined) {
        throw new Error(
          `Seed error: duplicate variant slug "${variant.slug}" under species "${species.name}" (${species.edition}) ` +
            `(variants ${seenVariantAt} and ${variantIndex})`,
        );
      }
      rowsByVariantSlug.set(variant.slug, variantIndex);
    });
  });

  assertSpeciesTraitsResolve(SPECIES, SPECIES_TRAITS);
  assertSpeciesGrantedSpellsResolve(SPECIES, SPECIES_GRANTED_SPELLS, SPELLS);

  return { familiesChecked: Object.keys(SEED_FAMILIES).length, rowsChecked };
}
