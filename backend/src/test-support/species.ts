import { prisma } from "@/lib/core/prisma.js";
import type { RulesEdition } from "@character-sheet/shared-types";

// Test-only helper. #1684 pruned the flat Race model — POST /api/characters'
// speciesId is now the required mechanical anchor, so a test that doesn't
// care WHICH species (only that creation succeeds) needs one line to resolve
// a seeded row rather than a repeated findFirstOrThrow. Defaults to 2024
// Dwarf: variant-free (no variantId requirement) AND choice-trait-free (no
// speciesSkills/speciesCantripId/speciesOriginFeatId request field) — 2024
// Human/Elf both carry a #1690 choice trait (Skillful/Versatile, Keen
// Senses) that would otherwise 400 a caller that only wants "some species".
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

// Test-only helper for a create body reused across BOTH editions in the same
// file (a default-2024 create + an explicit rulesEdition:"EDITION_2014" create
// sharing one BASE fixture, the common shape before #1684) — resolves the
// first seeded variant when the edition requires one (Dwarf's 2014 row
// requires a variantId; its 2024 row and every 2014 Human row don't) or the
// bare species otherwise. `name` defaults to Dwarf, which carries no #1690
// choice trait in either edition (see seededSpeciesId's own comment), so
// callers that don't care about species mechanics never also need
// speciesSkills/speciesCantripId/speciesOriginFeatId.
export async function seededSpeciesAnchor(edition: RulesEdition, name = "Dwarf"): Promise<SpeciesAnchor> {
  const species = await prisma.species.findFirstOrThrow({
    where: { name, edition },
    include: { variants: true },
  });
  const variant = species.variants[0];
  return variant ? { speciesId: species.id, variantId: variant.id } : { speciesId: species.id };
}
