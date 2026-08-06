// --- Subclass spell-list-expansion seeder (#1631) -----------------------------
// The executable counterpart to subclass-spell-list-expansions.ts's DATA
// (SUBCLASS_SPELL_LIST_EXPANSIONS) — mirrors seed-granted-spells.ts's shape
// (split out of seed.ts the same way, so a test can drive the upsert and
// prune directly), minus the gateLevel/castingAbility resolution that family
// carries (this one has neither column).
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { resolveEditionRow, upsertEditionRow } from "../../src/lib/rules/catalog-edition.js";
import { resolveCatalogSpellId } from "./resolve-catalog-spell.js";
import { SUBCLASS_SPELL_LIST_EXPANSIONS, type SubclassSpellListExpansionSeed } from "./subclass-spell-list-expansions.js";
import type { SeedEdition } from "./edition.js";

interface ExpansionSubclassRow {
  id: string;
  slug: string;
  edition: SeedEdition | null;
}

// Candidate for a SHARED (untagged) expansion row: the shared NULL Subclass
// row, else a SOLE tagged candidate — mirrors sharedGrantCandidate
// (seed-granted-spells.ts) exactly; no row in SUBCLASS_SPELL_LIST_EXPANSIONS
// is untagged today, but this keeps the two families' resolution identical
// for whichever homebrew/future content adds one.
function sharedExpansionCandidate(candidates: ExpansionSubclassRow[]): ExpansionSubclassRow | undefined {
  const shared = candidates.find((c) => c.edition === null);
  if (shared) return shared;
  return candidates.length === 1 ? candidates[0] : undefined;
}

function throwUnresolvedExpansionSubclass(candidates: ExpansionSubclassRow[], e: SubclassSpellListExpansionSeed): never {
  if (candidates.length > 1) {
    throw new Error(
      `Seed error: shared (untagged) list-expansion "${e.spellName}" targets subclass "${e.subclassName}" (${e.className}), ` +
        `which exists only as per-edition forks — tag the row with an edition (or one per edition) instead`,
    );
  }
  throw new Error(`Seed error: unknown subclass "${e.subclassName}" for ${e.className}`);
}

function resolveExpansionSubclass(
  candidates: ExpansionSubclassRow[],
  e: SubclassSpellListExpansionSeed,
): ExpansionSubclassRow {
  const resolved = e.edition ? resolveEditionRow(candidates, e.edition) : sharedExpansionCandidate(candidates);
  return resolved ?? throwUnresolvedExpansionSubclass(candidates, e);
}

// Resolve one list-expansion seed row's subclass + catalog spell to ids and
// upsert it by (subclassId, spellId, edition) — mirrors upsertGrantedSpell
// minus the gateLevel/castingAbility columns.
async function upsertExpansionSpell(
  prisma: PrismaClient,
  classIds: Map<string, string>,
  e: SubclassSpellListExpansionSeed,
): Promise<{ id: string; subclassSlug: string }> {
  const classId = classIds.get(e.className);
  if (!classId) throw new Error(`Seed error: unknown class "${e.className}" in SUBCLASS_SPELL_LIST_EXPANSIONS`);
  const candidates = await prisma.subclass.findMany({
    where: { classId, name: e.subclassName },
    select: { id: true, slug: true, edition: true },
  });
  const subclass = resolveExpansionSubclass(
    candidates.map((c) => ({ id: c.id, slug: c.slug, edition: c.edition as SeedEdition | null })),
    e,
  );
  const edition = e.edition ?? null;
  const spellId = await resolveCatalogSpellId(prisma, e.spellName, edition, "list-expansion");
  // upsertEditionRow, not .upsert(): the compound-key shorthand can't express
  // a null edition.
  const row = await upsertEditionRow(
    prisma.subclassSpellListExpansion,
    { subclassId: subclass.id, spellId, edition },
    { subclassId: subclass.id, spellId, edition },
    {},
  );
  return { id: row.id, subclassSlug: subclass.slug };
}

// Prune the rows a retag strands — mirrors pruneStaleGrantedSpells exactly
// (same identity shape: a row's identity is the (subclassId, spellId) FK
// pair, not a name/key/slug column, so this prunes by collected seeded ids
// scoped to the slugs this run actually touched). No character-reference
// guard needed: nothing references SubclassSpellListExpansion rows; the
// choosable pool is re-derived from the surviving rows on every read.
async function pruneStaleExpansionSpells(
  prisma: PrismaClient,
  seededIds: readonly string[],
  seededSlugs: readonly string[],
): Promise<void> {
  await prisma.subclassSpellListExpansion.deleteMany({
    where: {
      id: { notIn: [...seededIds] },
      subclass: { slug: { in: [...seededSlugs] } },
    },
  });
}

// Subclass spell-list expansions (#1631). Runs after subclasses AND spells
// are seeded — same ordering constraint as seedSubclassGrantedSpells.
// `expansions` is parameterizable so a test can drive a fabricated retag
// against its own fixture subclass (the seedSubclassGrantedSpells idiom).
export async function seedSubclassSpellListExpansions(
  prisma: PrismaClient,
  classIds: Map<string, string>,
  expansions: readonly SubclassSpellListExpansionSeed[] = SUBCLASS_SPELL_LIST_EXPANSIONS,
): Promise<void> {
  const seededIds: string[] = [];
  const seededSlugs = new Set<string>();
  for (const e of expansions) {
    const { id, subclassSlug } = await upsertExpansionSpell(prisma, classIds, e);
    seededIds.push(id);
    seededSlugs.add(subclassSlug);
  }
  await pruneStaleExpansionSpells(prisma, seededIds, [...seededSlugs]);
}
