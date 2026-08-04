// --- Species trait seeder (#1682, epic #1518) --------------------------------
// The executable counterpart to species-traits-data.ts's DATA (SPECIES_TRAITS)
// — split out the same way seed-species.ts is split from species-data.ts.
//
// SpeciesTrait carries no @@unique constraint (unlike Species/SpeciesVariant's
// real compound-unique keys, #1679 review — the natural key (speciesId,
// variantId, name) has a nullable `variantId`, the same NULLS-NOT-DISTINCT
// shape that made ClassFeature's own compound key require find-then-write
// instead of `.upsert()`, seed-class-features.ts's own header) — no schema
// change this slice (worktree note: #1679 already made the tables), so this
// reuses upsertEditionRow (lib/rules/catalog-edition.ts) generically: that
// helper only needs findFirst/create/update, it isn't edition-specific despite
// its name/JSDoc being framed around Feat/Subclass's nullable-edition case.
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client.js";
import { upsertEditionRow } from "../../src/lib/rules/catalog-edition.js";
import { SPECIES_TRAITS, type SpeciesTraitSeed } from "./species-traits-data.js";

interface SpeciesTarget {
  speciesId: string;
  variantId: string | null;
}

// Resolves a trait row's (speciesId, variantId) target from the just-seeded
// Species/SpeciesVariant rows (seedSpecies runs immediately before this in
// seed.ts's main()). Split out purely to keep seedSpeciesTraits' own
// cyclomatic complexity low (prisma/seed/** floors at the UNCOVERED CRAP
// formula regardless of real test coverage — mirrors resolveOneRow's own
// split in seed-species-features.ts's sibling, seed-class-features.ts).
function resolveTarget(
  trait: SpeciesTraitSeed,
  speciesByKey: Map<string, { id: string; variants: { id: string; slug: string }[] }>,
): SpeciesTarget {
  const species = speciesByKey.get(`${trait.speciesSlug}::${trait.speciesEdition}`);
  if (!species) {
    throw new Error(`seedSpeciesTraits: no Species row for slug "${trait.speciesSlug}" (${trait.speciesEdition})`);
  }
  if (!trait.variantSlug) return { speciesId: species.id, variantId: null };

  const variant = species.variants.find((v) => v.slug === trait.variantSlug);
  if (!variant) {
    throw new Error(
      `seedSpeciesTraits: no SpeciesVariant "${trait.variantSlug}" under species "${trait.speciesSlug}" (${trait.speciesEdition})`,
    );
  }
  return { speciesId: species.id, variantId: variant.id };
}

async function upsertTrait(prisma: PrismaClient, trait: SpeciesTraitSeed, target: SpeciesTarget): Promise<void> {
  // Prisma types a Json column as opaque InputJsonValue — cast once here,
  // mirroring seedClassFeatures' identical `improvements` write (seed-class-
  // features.ts) and character-create.ts's `toolProficiencies as unknown as
  // Prisma.InputJsonValue` precedent; validated at SEED time
  // (speciesTraitSeedSchema), not re-validated on write.
  const improvements = (trait.improvements ?? []) as unknown as Prisma.InputJsonValue;
  const data = {
    speciesId: target.speciesId,
    variantId: target.variantId,
    name: trait.name,
    description: trait.description,
    improvements,
  };
  await upsertEditionRow(
    prisma.speciesTrait,
    { speciesId: target.speciesId, variantId: target.variantId, name: trait.name },
    data,
    { description: trait.description, improvements },
  );
}

// De-dupes the run's targets by their (speciesId, variantId) prune key — the
// same key seededNamesByTargetKey is built with — so pruneStaleTraits stays
// under the seed-file cyclomatic budget (CC <= 4: seed code runs uncovered in
// globalSetup, so CRAP is complexity-driven, #1682/#1679).
function uniqueTargetsByPruneKey(targets: readonly SpeciesTarget[]): Map<string, SpeciesTarget> {
  const byKey = new Map<string, SpeciesTarget>();
  for (const target of targets) {
    const key = `${target.speciesId}::${target.variantId ?? "null"}`;
    if (!byKey.has(key)) byKey.set(key, target);
  }
  return byKey;
}

// Drops trait rows no longer authored, scoped to the exact (speciesId,
// variantId) targets this seed run touched — never a bare `deleteMany` over
// the whole table, for the same "don't nuke content a sibling row still needs"
// reason pruneStaleVariants gives in seed-species.ts.
async function pruneStaleTraits(
  prisma: PrismaClient,
  targets: readonly SpeciesTarget[],
  seededNamesByTargetKey: Map<string, string[]>,
): Promise<void> {
  for (const [key, target] of uniqueTargetsByPruneKey(targets)) {
    await prisma.speciesTrait.deleteMany({
      where: {
        speciesId: target.speciesId,
        variantId: target.variantId,
        name: { notIn: seededNamesByTargetKey.get(key) ?? [] },
      },
    });
  }
}

export async function seedSpeciesTraits(prisma: PrismaClient): Promise<void> {
  const speciesRows = await prisma.species.findMany({
    select: { id: true, slug: true, edition: true, variants: { select: { id: true, slug: true } } },
  });
  const speciesByKey = new Map(speciesRows.map((s) => [`${s.slug}::${s.edition}`, s]));

  const targets: SpeciesTarget[] = [];
  const seededNamesByTargetKey = new Map<string, string[]>();
  for (const trait of SPECIES_TRAITS) {
    const target = resolveTarget(trait, speciesByKey);
    await upsertTrait(prisma, trait, target);

    targets.push(target);
    const key = `${target.speciesId}::${target.variantId ?? "null"}`;
    const names = seededNamesByTargetKey.get(key) ?? [];
    names.push(trait.name);
    seededNamesByTargetKey.set(key, names);
  }

  await pruneStaleTraits(prisma, targets, seededNamesByTargetKey);
}
