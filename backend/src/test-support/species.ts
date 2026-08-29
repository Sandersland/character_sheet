import { prisma } from "@/lib/core/prisma.js";
import type { RulesEdition } from "@character-sheet/shared-types";

// Defaults to Dwarf: variant-free and carries no #1690 choice trait (unlike Human/Elf), so a caller that only wants "some species" doesn't also need speciesSkills/speciesCantripId/speciesOriginFeatId.
export async function seededSpeciesId(
  name = "Dwarf",
  edition: RulesEdition = "EDITION_2024",
): Promise<string> {
  const row = await prisma.species.findFirstOrThrow({ where: { name, edition } });
  return row.id;
}

export interface SpeciesAnchor {
  speciesId: string;
  variantId?: string;
}

// Resolves the first seeded variant when the edition requires one (e.g. Dwarf's 2014 row) or the bare species otherwise; defaults to Dwarf, which carries no #1690 choice trait in either edition.
export async function seededSpeciesAnchor(edition: RulesEdition, name = "Dwarf"): Promise<SpeciesAnchor> {
  const species = await prisma.species.findFirstOrThrow({
    where: { name, edition },
    include: { variants: true },
  });
  const variant = species.variants[0];
  return variant ? { speciesId: species.id, variantId: variant.id } : { speciesId: species.id };
}
