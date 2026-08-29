import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { resolveEditionRow, upsertEditionRow } from "../../src/lib/rules/catalog-edition.js";
import { resolveCatalogSpellId } from "./resolve-catalog-spell.js";
import { SUBCLASS_GRANTED_SPELLS, type SubclassGrantedSpellSeed } from "./subclass-granted-spells.js";
import type { SeedEdition } from "./edition.js";

interface GrantSubclassRow {
  id: string;
  slug: string;
  edition: SeedEdition | null;
}

// A sole tagged candidate (The Archfey/The Great Old One, EDITION_2014-only since #1233) resolves an untagged grant unambiguously.
function sharedGrantCandidate(candidates: GrantSubclassRow[]): GrantSubclassRow | undefined {
  const shared = candidates.find((c) => c.edition === null);
  if (shared) return shared;
  return candidates.length === 1 ? candidates[0] : undefined;
}

function throwUnresolvedGrantSubclass(candidates: GrantSubclassRow[], g: SubclassGrantedSpellSeed): never {
  if (candidates.length > 1) {
    throw new Error(
      `Seed error: shared (untagged) grant "${g.spellName}" targets subclass "${g.subclassName}" (${g.className}), ` +
        `which exists only as per-edition forks — tag the grant row with an edition (or one per edition) instead`,
    );
  }
  throw new Error(`Seed error: unknown subclass "${g.subclassName}" for ${g.className}`);
}

function resolveGrantSubclass(
  candidates: GrantSubclassRow[],
  g: SubclassGrantedSpellSeed,
): GrantSubclassRow {
  const resolved = g.edition
    ? resolveEditionRow(candidates, g.edition)
    : sharedGrantCandidate(candidates);
  return resolved ?? throwUnresolvedGrantSubclass(candidates, g);
}

// Returns the written row's id + its subclass's slug so seedSubclassGrantedSpells can prune what this run did NOT write.
async function upsertGrantedSpell(
  prisma: PrismaClient,
  classIds: Map<string, string>,
  g: SubclassGrantedSpellSeed,
): Promise<{ id: string; subclassSlug: string }> {
  const classId = classIds.get(g.className);
  if (!classId) throw new Error(`Seed error: unknown class "${g.className}" in SUBCLASS_GRANTED_SPELLS`);
  const candidates = await prisma.subclass.findMany({
    where: { classId, name: g.subclassName },
    select: { id: true, slug: true, edition: true },
  });
  const subclass = resolveGrantSubclass(
    candidates.map((c) => ({ id: c.id, slug: c.slug, edition: c.edition as SeedEdition | null })),
    g,
  );
  const edition = g.edition ?? null;
  const spellId = await resolveCatalogSpellId(prisma, g.spellName, edition, "granted");
  // upsertEditionRow, not .upsert(): the compound-key shorthand can't express
  // a null edition (which most grant rows have).
  const row = await upsertEditionRow(
    prisma.subclassGrantedSpell,
    { subclassId: subclass.id, spellId, edition },
    { subclassId: subclass.id, spellId, gateLevel: g.gateLevel, castingAbility: g.castingAbility, edition },
    { gateLevel: g.gateLevel, castingAbility: g.castingAbility },
  );
  return { id: row.id, subclassSlug: subclass.slug };
}

// staleCatalogRowsWhere doesn't fit here: a grant row's identity is the (subclassId, spellId) FK pair, not a name/key/slug column, so pruning is scoped by seeded ids + granted slugs instead.
async function pruneStaleGrantedSpells(
  prisma: PrismaClient,
  seededIds: readonly string[],
  seededSlugs: readonly string[],
): Promise<void> {
  await prisma.subclassGrantedSpell.deleteMany({
    where: {
      id: { notIn: [...seededIds] },
      subclass: { slug: { in: [...seededSlugs] } },
    },
  });
}

// Runs after subclasses AND spells are seeded.
export async function seedSubclassGrantedSpells(
  prisma: PrismaClient,
  classIds: Map<string, string>,
  grants: readonly SubclassGrantedSpellSeed[] = SUBCLASS_GRANTED_SPELLS,
): Promise<void> {
  const seededIds: string[] = [];
  const seededSlugs = new Set<string>();
  for (const g of grants) {
    const { id, subclassSlug } = await upsertGrantedSpell(prisma, classIds, g);
    seededIds.push(id);
    seededSlugs.add(subclassSlug);
  }
  await pruneStaleGrantedSpells(prisma, seededIds, [...seededSlugs]);
}
