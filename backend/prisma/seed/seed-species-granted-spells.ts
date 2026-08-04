// --- Species granted-spell seeder (#1683, epic #1518 slice 6/8) --------------
// The executable counterpart to species-granted-spells-data.ts's DATA
// (SPECIES_GRANTED_SPELLS) — split the same way seed-species-traits.ts splits
// from species-traits-data.ts. Runs after seedSpecies (targets resolve
// against just-seeded Species/SpeciesVariant rows) AND seedSpells (spellId
// resolves against the just-seeded Spell catalog) — see seed.ts's call order.
//
// SpeciesGrantedSpell carries no @@unique constraint (same nullable-variantId
// NULLS-NOT-DISTINCT shape SpeciesTrait's header explains) — reuses
// upsertEditionRow (lib/rules/catalog-edition.ts) generically, exactly as
// seed-species-traits.ts already does for SpeciesTrait.
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { upsertEditionRow } from "../../src/lib/rules/catalog-edition.js";
import { SPECIES_GRANTED_SPELLS, type SpeciesGrantedSpellSeed } from "./species-granted-spells-data.js";
import { loadSpeciesByKey, type SpeciesLookupRow } from "./species-seed-lookup.js";

interface GrantTarget {
  speciesId: string;
  variantId: string;
}

// Resolves a grant row's (speciesId, variantId) target — every row this
// slice seeds is variant-level (no species-level 2024 spell grant exists),
// so unlike seed-species-traits.ts's resolveTarget this never returns a null
// variantId. Split out purely to keep seedSpeciesGrantedSpells' own
// cyclomatic complexity under the seed-file budget (CC <= 4).
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

// Drops grant rows no longer authored, scoped to the exact variant ids this
// run touched — the same "never a bare deleteMany over the whole table"
// discipline pruneStaleTraits/pruneStaleVariants document.
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
