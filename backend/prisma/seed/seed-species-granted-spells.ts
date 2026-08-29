// #1683: must run after seedSpecies (targets resolve against just-seeded Species/SpeciesVariant rows) AND seedSpells (spellId resolves against the just-seeded Spell catalog).
// SpeciesGrantedSpell carries no @@unique constraint (same nullable-variantId shape as SpeciesTrait) — reuses upsertEditionRow generically, exactly as seedSpeciesTraits does.
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { upsertEditionRow } from "../../src/lib/rules/catalog-edition.js";
import { SPECIES_GRANTED_SPELLS, type SpeciesGrantedSpellSeed } from "./species-granted-spells-data.js";
import { loadSpeciesByKey, type SpeciesLookupRow } from "./species-seed-lookup.js";

interface GrantTarget {
  speciesId: string;
  variantId: string;
}

// Every row this slice seeds is variant-level (no species-level 2024 spell grant exists), so unlike resolveTarget in seedSpeciesTraits, this never returns a null variantId.
function resolveGrantTarget(grant: SpeciesGrantedSpellSeed, speciesByKey: Map<string, SpeciesLookupRow>): GrantTarget {
  const species = speciesByKey.get(`${grant.speciesSlug}::${grant.speciesEdition}`);
  if (!species) {
    throw new Error(`seedSpeciesGrantedSpells: no Species row for slug "${grant.speciesSlug}" (${grant.speciesEdition})`);
  }
  const variant = species.variants.find((v) => v.slug === grant.variantSlug);
  if (!variant) {
    throw new Error(
      `seedSpeciesGrantedSpells: no SpeciesVariant "${grant.variantSlug}" under species "${grant.speciesSlug}" (${grant.speciesEdition})`,
    );
  }
  return { speciesId: species.id, variantId: variant.id };
}

async function upsertGrant(
  prisma: PrismaClient,
  grant: SpeciesGrantedSpellSeed,
  target: GrantTarget,
  spellIdByName: Map<string, string>,
): Promise<string> {
  const spellId = spellIdByName.get(grant.spellName);
  if (!spellId) throw new Error(`seedSpeciesGrantedSpells: granted spell "${grant.spellName}" not in the Spell catalog`);
  const data = { speciesId: target.speciesId, variantId: target.variantId, spellId, gateLevel: grant.gateLevel };
  const row = await upsertEditionRow(
    prisma.speciesGrantedSpell,
    { speciesId: target.speciesId, variantId: target.variantId, spellId },
    data,
    { gateLevel: grant.gateLevel },
  );
  return row.id;
}

// Scoped to the exact variant ids this run touched — never a bare deleteMany over the whole table, same discipline as pruneStaleTraits/pruneStaleVariants.
async function pruneStaleGrants(prisma: PrismaClient, touchedVariantIds: readonly string[], seededIds: readonly string[]): Promise<void> {
  await prisma.speciesGrantedSpell.deleteMany({
    where: { variantId: { in: [...new Set(touchedVariantIds)] }, id: { notIn: [...seededIds] } },
  });
}

export async function seedSpeciesGrantedSpells(prisma: PrismaClient): Promise<void> {
  const speciesByKey = await loadSpeciesByKey(prisma, { edition: "EDITION_2024" });
  const spellRows = await prisma.spell.findMany({ select: { id: true, name: true } });
  const spellIdByName = new Map(spellRows.map((s) => [s.name, s.id]));

  const seededIds: string[] = [];
  const touchedVariantIds: string[] = [];
  for (const grant of SPECIES_GRANTED_SPELLS) {
    const target = resolveGrantTarget(grant, speciesByKey);
    seededIds.push(await upsertGrant(prisma, grant, target, spellIdByName));
    touchedVariantIds.push(target.variantId);
  }

  await pruneStaleGrants(prisma, touchedVariantIds, seededIds);
}
