import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { SeedEdition } from "./edition.js";

export interface SpeciesLookupRow {
  id: string;
  slug: string;
  edition: SeedEdition;
  variants: { id: string; slug: string }[];
}

// `where` narrows the scan (seedSpeciesGrantedSpells targets only EDITION_2024); omitted loads every species, matching seedSpeciesTraits' unscoped scan.
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
