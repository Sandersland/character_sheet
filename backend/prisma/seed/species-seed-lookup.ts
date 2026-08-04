// Shared (slug, edition) -> Species row lookup, built from the just-seeded
// Species/SpeciesVariant rows — the SAME shape seed-species-traits.ts and
// seed-species-granted-spells.ts each resolve their own targets against
// (fallow flagged the query+map pair as a clone; extracted once rather than
// kept as two near-identical copies).
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { SeedEdition } from "./edition.js";

export interface SpeciesLookupRow {
  id: string;
  slug: string;
  edition: SeedEdition;
  variants: { id: string; slug: string }[];
}

// `where` narrows the scan (seedSpeciesGrantedSpells only ever targets
// EDITION_2024 rows this slice); omitted loads every species, matching
// seedSpeciesTraits' unscoped 2014+2024 scan.
export async function loadSpeciesByKey(
  prisma: PrismaClient,
  where?: { edition: SeedEdition },
): Promise<Map<string, SpeciesLookupRow>> {
  const rows = await prisma.species.findMany({
    where,
    select: { id: true, slug: true, edition: true, variants: { select: { id: true, slug: true } } },
  });
  return new Map(rows.map((s) => [`${s.slug}::${s.edition}`, s as SpeciesLookupRow]));
}
