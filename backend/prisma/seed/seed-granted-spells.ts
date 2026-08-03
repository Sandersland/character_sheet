// --- Subclass granted-spell seeder (#898/#1625) -------------------------------
// The executable counterpart to subclass-granted-spells.ts's DATA
// (SUBCLASS_GRANTED_SPELLS) — split out of seed.ts the same way
// seed-subclasses.ts split from subclasses.ts, so a test can drive the upsert
// and prune directly (seed.ts self-invokes main() at module load and can't be
// re-run from a test).
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { resolveEditionRow, upsertEditionRow } from "../../src/lib/rules/catalog-edition.js";
import { SUBCLASS_GRANTED_SPELLS, type SubclassGrantedSpellSeed } from "./subclass-granted-spells.js";
import type { SeedEdition } from "./edition.js";

interface GrantSubclassRow {
  id: string;
  slug: string;
  edition: SeedEdition | null;
}

// Resolve the Subclass row a grant attaches to, from every (classId, name)
// candidate — the key stays (classId, name) so #1408's slug rekey is a pure
// lookup-key swap. This replaced the deterministic-but-arbitrary
// findFirst + orderBy latch that predated the grant's own edition axis:
//  - a TAGGED grant resolves exactly like a character of that edition would
//    (resolveEditionRow: exact-edition row, else the shared NULL row);
//  - a SHARED grant belongs on the shared NULL row; a sole tagged candidate
//    (The Archfey/The Great Old One, EDITION_2014-only since #1233) also
//    admits it, since only that edition's characters can hold the subclass;
//  - a shared grant over a name forked into MULTIPLE tagged rows is ambiguous
//    (which fork was meant?) and a hard seed error rather than a guess.
function resolveGrantSubclass(
  candidates: GrantSubclassRow[],
  g: SubclassGrantedSpellSeed,
): GrantSubclassRow {
  const edition = g.edition ?? null;
  const resolved = edition
    ? resolveEditionRow(candidates, edition)
    : candidates.find((c) => c.edition === null) ?? (candidates.length === 1 ? candidates[0] : undefined);
  if (!resolved) {
    if (candidates.length > 1) {
      throw new Error(
        `Seed error: shared (untagged) grant "${g.spellName}" targets subclass "${g.subclassName}" (${g.className}), ` +
          `which exists only as per-edition forks — tag the grant row with an edition (or one per edition) instead`,
      );
    }
    throw new Error(`Seed error: unknown subclass "${g.subclassName}" for ${g.className}`);
  }
  return resolved;
}

// Resolve one granted-spell seed row's subclass + catalog spell to ids and
// upsert it by (subclassId, spellId, edition). A missing class/subclass/spell
// is a hard seed error (mirrors the other catalogs' fail-fast on unknown
// references). Returns the written row's id + its subclass's slug so
// seedSubclassGrantedSpells can prune what this run did NOT write.
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
  const spell = await prisma.spell.findUnique({ where: { name: g.spellName }, select: { id: true } });
  if (!spell) throw new Error(`Seed error: granted spell "${g.spellName}" not in the Spell catalog`);
  const edition = g.edition ?? null;
  // upsertEditionRow, not .upsert(): the compound-key shorthand can't express
  // a null edition (which most grant rows have).
  const row = await upsertEditionRow(
    prisma.subclassGrantedSpell,
    { subclassId: subclass.id, spellId: spell.id, edition },
    { subclassId: subclass.id, spellId: spell.id, gateLevel: g.gateLevel, castingAbility: g.castingAbility, edition },
    { gateLevel: g.gateLevel, castingAbility: g.castingAbility },
  );
  return { id: row.id, subclassSlug: subclass.slug };
}

// Prune the rows a retag strands (a grant NULL -> per-edition fork leaves the
// old shared row behind — upsertEditionRow's where includes `edition`, so the
// retag CREATES rather than updates in place, same as seedSubclasses' #1559
// shape). staleCatalogRowsWhere can't serve this family: a grant row's
// identity is the (subclassId, spellId) FK pair, not a name/key/slug column —
// so this prunes by collected seeded ids instead, scoped to the slugs this
// run actually granted onto. The slug scoping is what keeps a fixture or
// future homebrew subclass's grant rows (never in the seeded set) out of
// reach, mirroring seedSubclasses' seededSlugs restriction — and it sweeps by
// SLUG, not subclass id, so grant rows stranded on a since-retagged Subclass
// row (same slug, new id) are still caught. No character-reference guard is
// needed here: nothing references SubclassGrantedSpell rows; grants are
// re-derived from the surviving rows on every read.
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

// Subclass-granted spells (#898). Runs after subclasses AND spells are seeded.
// `grants` is parameterizable so a test can drive a fabricated retag against
// its own fixture subclass (the seed-subclasses.ts idiom).
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
