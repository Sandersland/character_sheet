// Seed-time content validation (#1277). Malformed catalog content fails the
// seed with a row-indexed message instead of writing a broken row that only
// 500s later at read time. Composes zod schemas that live co-located with
// their content (e.g. subclasses.ts's subclassSeedSchema) rather than one
// central schema file, so a family's schema changes in the same diff as its
// content shape. SEED_FAMILIES is a registry, not a hardcoded list of calls —
// adding a family is one entry here.
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
import { SPELLS, spellSeedSchema } from "./spells.js";
import { SPELLS_2014 } from "./spells-2014/index.js";
import { MANEUVERS, maneuverSeedSchema } from "./maneuvers.js";
import { SHADOW_ARTS, shadowArtSeedSchema } from "./shadow-arts.js";
import { DISCIPLINES, disciplineSeedSchema } from "./disciplines.js";
import { CHANNEL_DIVINITIES, channelDivinitySeedSchema } from "./channel-divinity.js";
import { SUBCLASS_CHOICE_OPTIONS, subclassChoiceOptionSeedSchema } from "./subclass-choices.js";

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
  // The background twin, validated by the same tree shape keyed by
  // backgroundName instead of className (#1565).
  BACKGROUND_STARTING_EQUIPMENT_PACKAGES: {
    schema: backgroundStartingEquipmentSeedSchema,
    rows: BACKGROUND_STARTING_EQUIPMENT_PACKAGES,
  },
  // speciesSeedSchema validates the nested variants array too, so no separate
  // SPECIES_VARIANTS family is needed.
  SPECIES: { schema: speciesSeedSchema, rows: SPECIES },
  // Cross-referenced against SPECIES below: a speciesSlug/variantSlug typo is
  // a broken FK resolution at seed time otherwise, not a zod-catchable shape error.
  SPECIES_TRAITS: { schema: speciesTraitSeedSchema, rows: SPECIES_TRAITS },
  // Cross-referenced against SPECIES (variant must exist) and SPELLS
  // (spellName must resolve) below, same split as SPECIES_TRAITS.
  SPECIES_GRANTED_SPELLS: { schema: speciesGrantedSpellSeedSchema, rows: SPECIES_GRANTED_SPELLS },
  // SPELLS (2024, this file's default) and SPELLS_2014 (the 2014 fork) are separate arrays —
  // both validate against the SAME spellSeedSchema (spells.ts), the one CatalogSpell shape.
  SPELLS: { schema: spellSeedSchema, rows: SPELLS },
  SPELLS_2014: { schema: spellSeedSchema, rows: SPELLS_2014 },
  // The five GrantedAbility source families (source discriminates: maneuver / shadowArts /
  // discipline / channelDivinity / the choice's own catalogSource) — each keeps its own
  // co-located schema since their column shapes only partially overlap.
  MANEUVERS: { schema: maneuverSeedSchema, rows: MANEUVERS },
  SHADOW_ARTS: { schema: shadowArtSeedSchema, rows: SHADOW_ARTS },
  DISCIPLINES: { schema: disciplineSeedSchema, rows: DISCIPLINES },
  CHANNEL_DIVINITIES: { schema: channelDivinitySeedSchema, rows: CHANNEL_DIVINITIES },
  SUBCLASS_CHOICE_OPTIONS: { schema: subclassChoiceOptionSeedSchema, rows: SUBCLASS_CHOICE_OPTIONS },
};

export interface SeedValidationSummary {
  familiesChecked: number;
  rowsChecked: number;
}

// Split into one function per tree level: prisma/seed/** has no coverage instrumentation, so a
// single triple-nested-loop version would fail the uncovered-CRAP complexity gate regardless of
// real test coverage.
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

// Pure (#1533 [R3]): assertSeedContentValid runs BEFORE seedClasses/
// seedItems/seedPacks, so this can't query the database — it fails the seed
// before anything is written instead.
function collectCatalogNames(rows: readonly { package: PackageTree }[]): string[] {
  return rows.flatMap((row) => row.package.groups.flatMap(catalogNamesInGroup));
}

// resolveFixedItems (lib/character/create/equipment.ts) looks a catalogName up against Pack
// FIRST, then Item — so a catalogName is valid if it resolves against EITHER
// catalog. All seven packs also exist as ITEMS rows today (#1533 [R4]), so an
// Item-only check would pass by luck and only diverge the first time they do.
// `familyName` (#1565) names the offending family in the thrown message,
// since one function now serves both the class and background packages.
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

// Shared variant-slug resolution check for the SpeciesTrait and
// SpeciesGrantedSpell seed validators (#1682/#1683) — split out to keep every
// seed validator under the seed-file cyclomatic budget (CC <= 4). `context`
// identifies the calling row for the error message (e.g. "SPECIES_TRAITS[3]").
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

// The #1682 twin of assertCatalogNamesResolve above — catches a typo'd slug
// before seedSpeciesTraits' DB-backed resolveTarget throws a less specific
// runtime error mid-seed.
function assertSpeciesTraitsResolve(speciesRows: typeof SPECIES, traitRows: typeof SPECIES_TRAITS): void {
  const speciesByKey = new Map(speciesRows.map((s) => [`${s.slug}::${s.edition}`, s]));
  const seen = new Set<string>();
  traitRows.forEach((trait, index) => assertSpeciesTraitRowResolves(trait, index, speciesByKey, seen));
}

// The #1683 twin of assertSpeciesTraitRowResolves above — catches a typo'd
// slug/name before seedSpeciesGrantedSpells' DB-backed resolution throws a
// less specific error. Every SPECIES_GRANTED_SPELLS row is variant-level.
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

interface PoolDeclaringRowCandidate {
  className: string;
  subclassSlug: string | null;
  edition: string;
  resourceKey?: string | null;
  resourceTotals?: unknown[] | null;
}

// "Pool-declaring" means resourceKey AND a populated resourceTotals — an
// identity-only resourceKey (Metamagic's own pattern, #1909) never contends
// here, matching findOverrideRow's own tierAt-reachability guard.
function isPoolDeclaringRow(row: PoolDeclaringRowCandidate): boolean {
  return Boolean(row.resourceKey) && Boolean(row.resourceTotals?.length);
}

function poolDeclaringRowKey(row: PoolDeclaringRowCandidate): string {
  return `${row.className}::${row.subclassSlug ?? "null"}::${row.resourceKey}::${row.edition}`;
}

// #906: findOverrideRow picks its target via the FIRST matching row — two
// pool-declaring rows sharing (class, subclass, resourceKey, edition) would
// let seed content ORDER silently decide which one wins, an ambiguity no
// per-row schema can catch.
export function assertNoDuplicatePoolDeclaringRows(rows: readonly PoolDeclaringRowCandidate[]): void {
  const rowsByKey = new Map<string, number>();
  rows.forEach((row, index) => {
    if (!isPoolDeclaringRow(row)) return;
    const key = poolDeclaringRowKey(row);
    const seenAt = rowsByKey.get(key);
    if (seenAt !== undefined) {
      throw new Error(`Seed error: duplicate pool-declaring ClassFeature row for "${key}" (rows ${seenAt} and ${index})`);
    }
    rowsByKey.set(key, index);
  });
}

interface ChoiceDeclaringRowCandidate {
  className: string;
  subclassSlug: string | null;
  edition: string;
  choiceKey?: string | null;
}

// choiceColumnsDeclareTogether guarantees choiceKey implies the full column trio.
function isChoiceDeclaringRow(row: ChoiceDeclaringRowCandidate): boolean {
  return Boolean(row.choiceKey);
}

function choiceDeclaringRowKey(row: ChoiceDeclaringRowCandidate): string {
  return `${row.className}::${row.subclassSlug ?? "null"}::${row.choiceKey}::${row.edition}`;
}

// Downstream consumers key by choiceKey alone, so a same-edition duplicate
// would let seed content order silently decide which entry wins (#899).
export function assertNoDuplicateChoiceDeclaringRows(rows: readonly ChoiceDeclaringRowCandidate[]): void {
  const rowsByKey = new Map<string, number>();
  rows.forEach((row, index) => {
    if (!isChoiceDeclaringRow(row)) return;
    const key = choiceDeclaringRowKey(row);
    const seenAt = rowsByKey.get(key);
    if (seenAt !== undefined) {
      throw new Error(`Seed error: duplicate choice-declaring ClassFeature row for "${key}" (rows ${seenAt} and ${index})`);
    }
    rowsByKey.set(key, index);
  });
}

// A short "(name, edition)" tag for the error message below — every family's rows carry `name`
// EXCEPT StartingEquipmentPackage's two families, which key on `className`/`backgroundName`
// instead; falls back to those so the message still identifies the row rather than just its index.
export function rowIdentity(row: unknown): string {
  if (typeof row !== "object" || row === null) return "";
  const r = row as Record<string, unknown>;
  const label = [r.name, r.className, r.backgroundName].find((v) => typeof v === "string");
  const edition = typeof r.edition === "string" ? r.edition : undefined;
  const parts = [label, edition].filter((v): v is string => typeof v === "string");
  return parts.length ? ` (${parts.join(", ")})` : "";
}

// Reads the actual offending value back off the row via the issue's own path, so the thrown
// message shows what was received without depending on zod-version-specific issue shapes (v4's
// `invalid_value` issue carries no `received` field the way v3's `invalid_enum_value` did).
function valueAtPath(row: unknown, path: readonly PropertyKey[]): unknown {
  return path.reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<PropertyKey, unknown>)[key] : undefined), row);
}

/**
 * Validates every registered family's rows against its schema, throwing on
 * the FIRST invalid row with its family/index/identity/path/value. Also
 * enforces cross-row invariants no per-row schema can express: two SUBCLASSES
 * rows must never share a slug (a duplicate would silently collapse two
 * subclasses' seeded content onto one DB row), every
 * STARTING_EQUIPMENT_PACKAGES catalogName must resolve against ITEMS ∪ PACKS,
 * and no two CLASS_FEATURES rows may declare the same pool or the same choice
 * key.
 *
 * Returns a summary so a permanent test can assert this function actually
 * visited real content, rather than reporting "valid" vacuously (#1370).
 */
export function assertSeedContentValid(): SeedValidationSummary {
  let rowsChecked = 0;
  for (const [familyName, { schema, rows }] of Object.entries(SEED_FAMILIES)) {
    rows.forEach((row, index) => {
      const result = schema.safeParse(row);
      if (!result.success) {
        const issue = result.error.issues[0];
        const path = issue.path.join(".");
        const value = valueAtPath(row, issue.path);
        throw new Error(
          `Seed content invalid — ${familyName}[${index}]${rowIdentity(row)}${path ? `.${path}` : ""} = ${JSON.stringify(value)}: ${issue.message}`,
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
  assertNoDuplicateChoiceDeclaringRows(CLASS_FEATURES);

  // No two SPECIES rows may share (slug, edition), catching what
  // @@unique([slug, edition]) would otherwise surface as an opaque P2002
  // mid-seed. Nested variant slugs are checked per-species, since
  // @@unique([speciesId, slug]) scopes uniqueness to the parent, not the whole table.
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
