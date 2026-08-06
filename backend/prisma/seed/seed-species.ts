// --- Species seeder (#1679, epic #1518) --------------------------------------
// The executable counterpart to species-data.ts's DATA (SPECIES) — split out
// the same way seed-subclasses.ts is split from subclasses.ts, so a test can
// import seedSpecies directly (seed.ts self-invokes main() at module load and
// can't be re-run from a test).
//
// Upserts by (slug, edition) — Species.edition is NOT NULL (unlike Subclass's
// nullable edition), so, unlike upsertEditionRow's find-then-write dance, the
// plain compound-unique shorthand works directly: there is no NULL-edition
// row this table could ever hold. Variants upsert by (speciesId, slug), the
// scoped-to-parent twin.
//
// No remap-before-prune guard (contrast pruneStaleSubclasses' #1559 machinery):
// this is a BRAND NEW table with nothing pointing at it in production yet, and
// the epic explicitly rules out building remap machinery here (owner decision
// 2 / review decision 10) — CharacterRace.speciesId/variantId are onDelete:
// SetNull, so a stale-row prune only ever un-links a dev/test fixture, never
// corrupts one silently.
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { SPECIES, type SpeciesSeed } from "./species-data.js";
import type { SeedEdition } from "./edition.js";

// Species-specific stale-row where, NOT staleCatalogRowsWhere (prune.ts):
// that helper's null-edition partition is unusable here — Species.edition is
// NOT NULL, and Prisma's generated filter type for a non-nullable enum column
// rejects a literal `edition: null` outright ("Argument `edition` is
// missing"), where a nullable-edition table like Subclass accepts it. Only
// two partitions exist for Species, so this is the two-branch version of the
// same "notIn per edition, never a flat notIn across both" idea.
function staleSpeciesWhere(seeded: readonly { slug: string; edition: SeedEdition }[]) {
  const editions: SeedEdition[] = ["EDITION_2014", "EDITION_2024"];
  return {
    OR: editions.map((edition) => ({
      edition,
      slug: { notIn: seeded.filter((s) => s.edition === edition).map((s) => s.slug) },
    })),
  };
}

type SpeciesVariantSeed = NonNullable<SpeciesSeed["variants"]>[number];

// Split out of seedVariants so that function stays under the seed-file
// cyclomatic budget (CC <= 4): seed helpers run in globalSetup, uncovered by
// vitest, so CRAP is driven by complexity alone — the two `??` defaults live
// here rather than inflating the loop (#1679 review).
function variantRow(speciesId: string, variant: SpeciesVariantSeed) {
  return {
    speciesId,
    name: variant.name,
    slug: variant.slug,
    speedOverride: variant.speedOverride ?? null,
    abilityIncreases: variant.abilityIncreases ?? [],
    abilityIncreasesReplace: variant.abilityIncreasesReplace ?? false,
  };
}

// Drop variants this species no longer seeds (a renamed/retired subrace),
// scoped to THIS species' rows only, never the whole table.
async function pruneStaleVariants(
  prisma: PrismaClient,
  speciesId: string,
  species: SpeciesSeed,
  seededSlugs: string[],
): Promise<void> {
  const where = { speciesId, slug: { notIn: seededSlugs } };
  const stale = await prisma.speciesVariant.findMany({ where, select: { name: true } });
  if (stale.length) {
    console.log(`seedSpecies: dropping stale variant rows for ${species.name} (${species.edition}): ${stale.map((v) => v.name).join(", ")}`);
  }
  await prisma.speciesVariant.deleteMany({ where });
}

async function seedVariants(prisma: PrismaClient, speciesId: string, species: SpeciesSeed): Promise<void> {
  const variants = species.variants ?? [];
  for (const variant of variants) {
    const data = variantRow(speciesId, variant);
    await prisma.speciesVariant.upsert({
      where: { speciesId_slug: { speciesId, slug: variant.slug } },
      create: data,
      update: data,
    });
  }
  await pruneStaleVariants(
    prisma,
    speciesId,
    species,
    variants.map((v) => v.slug),
  );
}

export async function seedSpecies(prisma: PrismaClient): Promise<void> {
  for (const species of SPECIES) {
    const data = {
      name: species.name,
      slug: species.slug,
      speed: species.speed,
      edition: species.edition,
      abilityIncreases: species.abilityIncreases ?? [],
    };
    const row = await prisma.species.upsert({
      where: { slug_edition: { slug: species.slug, edition: species.edition } },
      create: data,
      update: data,
    });
    await seedVariants(prisma, row.id, species);
  }

  const staleWhere = staleSpeciesWhere(SPECIES.map((s) => ({ slug: s.slug, edition: s.edition })));
  const stale = await prisma.species.findMany({ where: staleWhere, select: { name: true, edition: true } });
  if (stale.length) {
    console.log(`seedSpecies: dropping stale catalog rows: ${stale.map((s) => `${s.name} (${s.edition})`).join(", ")}`);
  }
  // Cascade drops the stale species' own variants/traits/grantedSpells too.
  await prisma.species.deleteMany({ where: staleWhere });
}
