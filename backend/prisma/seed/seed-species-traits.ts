// SpeciesTrait has no @@unique constraint — its natural key (speciesId, variantId, name) has a nullable variantId, the same shape that makes ClassFeature need find-then-write. upsertEditionRow is reused here despite the name: it only needs findFirst/create/update and isn't actually edition-specific.
import { Prisma } from "../../src/generated/prisma/client.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { upsertEditionRow } from "../../src/lib/rules/catalog-edition.js";
import { SPECIES_TRAITS, type SpeciesTraitSeed } from "./species-traits-data.js";
import { loadSpeciesByKey } from "./species-seed-lookup.js";

interface SpeciesTarget {
  speciesId: string;
  variantId: string | null;
}

// Resolves a trait row's (speciesId, variantId) target from the just-seeded Species/SpeciesVariant rows — seedSpecies must run immediately before this.
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
  // Prisma types a Json column as opaque InputJsonValue — cast once here; validated at seed time (speciesTraitSeedSchema), not re-validated on write.
  const improvements = (trait.improvements ?? []) as unknown as Prisma.InputJsonValue;
  // #1689: NULL must be Prisma.DbNull, not a bare `null` — nullable Json columns reject the literal per Prisma's own type.
  const choice = (trait.choice as unknown as Prisma.InputJsonValue | undefined) ?? Prisma.DbNull;
  const data = {
    speciesId: target.speciesId,
    variantId: target.variantId,
    name: trait.name,
    description: trait.description,
    improvements,
    choice,
  };
  await upsertEditionRow(
    prisma.speciesTrait,
    { speciesId: target.speciesId, variantId: target.variantId, name: trait.name },
    data,
    { description: trait.description, improvements, choice },
  );
}

// De-dupes the run's targets by the same (speciesId, variantId) key seededNamesByTargetKey is built with below — keep them in sync.
function uniqueTargetsByPruneKey(targets: readonly SpeciesTarget[]): Map<string, SpeciesTarget> {
  const byKey = new Map<string, SpeciesTarget>();
  for (const target of targets) {
    const key = `${target.speciesId}::${target.variantId ?? "null"}`;
    if (!byKey.has(key)) byKey.set(key, target);
  }
  return byKey;
}

// Drops trait rows no longer authored, scoped to the exact (speciesId, variantId) targets this seed run touched — never a bare `deleteMany` over the whole table, for the same reason pruneStaleVariants is scoped.
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
  const speciesByKey = await loadSpeciesByKey(prisma);

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
