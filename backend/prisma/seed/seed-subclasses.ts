// --- Subclass seeder (#1306/#1559) -------------------------------------------
// The executable counterpart to subclasses.ts's DATA (SUBCLASSES) — split out
// per #1277 AC 4 / scripts/check-seed-data-modules.sh (LOGIC_EXCEPTIONS),
// mirroring seed-class-features.ts's split from class-features.ts. Also lets
// a test import assertNoCharactersReferenceStaleSubclasses/pruneStaleSubclasses
// directly, unlike seed.ts, which self-invokes main() at module load.
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { upsertEditionRow } from "../../src/lib/rules/catalog-edition.js";
import { staleCatalogRowsWhere } from "./prune.js";
import { SUBCLASSES } from "./subclasses.js";
import type { SeedEdition } from "./edition.js";

export interface StaleSubclassRow {
  id: string;
  slug: string;
  edition: SeedEdition | null;
}

// A retag gives an existing subclass slug a NEW row id — upsertEditionRow's
// `where` includes `edition`, so retagging a previously-shared row (Totem
// Warrior null -> EDITION_2014, #1559) finds no match and CREATES rather
// than updates in place, leaving the OLD row for pruneStaleSubclasses to
// drop. `CharacterClassEntry.subclassRef` is `onDelete: SetNull`
// (schema.prisma) — deleting a row a live character's CharacterClassEntry
// still points at would SILENTLY null out that character's subclass, not
// error. That silence is the one failure mode this seed must never produce,
// so it gets its own loud stop rather than the quiet FK behavior Postgres
// would otherwise apply. (The other two relations FROM catalog rows TO
// Subclass — ClassFeature.subclass, SubclassGrantedSpell.subclass — are
// `onDelete: Cascade` and rewritten by their own seeders in the SAME run, so
// they need no guard here; only CharacterClassEntry reaches user data.)
//
// Parameterized on the stale-row list rather than reading SUBCLASSES
// directly, so a test can fabricate a retag against its OWN fixture subclass
// in isolation from the real 31-row catalog — the same "call the underlying
// primitive directly" idiom action-fork-reseed.test.ts uses, since seed.ts
// can't be re-invoked from a test (it self-invokes main() at module load).
export async function assertNoCharactersReferenceStaleSubclasses(
  prisma: PrismaClient,
  stale: readonly StaleSubclassRow[],
): Promise<void> {
  if (stale.length === 0) return;
  const referencing = await prisma.characterClassEntry.groupBy({
    by: ["subclassId"],
    where: { subclassId: { in: stale.map((s) => s.id) } },
    _count: { _all: true },
  });
  const countBySubclassId = new Map<string, number>();
  for (const r of referencing) {
    if (r.subclassId) countBySubclassId.set(r.subclassId, r._count._all);
  }
  const messages = stale
    .filter((s) => countBySubclassId.has(s.id))
    .map((s) => `  ${s.slug} (${s.edition ?? "shared"}): ${countBySubclassId.get(s.id)} referencing CharacterClassEntry row(s)`);

  if (messages.length > 0) {
    throw new Error(
      [
        "seedSubclasses: refusing to prune a Subclass row a live character still references (#1559) —",
        ...messages,
        "CharacterClassEntry.subclassRef is onDelete: SetNull, so deleting this row would silently null",
        "out those characters' subclass instead of erroring. Remap the referencing CharacterClassEntry",
        "rows onto the retained (slug, edition) row first, then re-run the seed.",
      ].join("\n"),
    );
  }
}

// Prune the row a subclass's edition tag CHANGE strands (Totem Warrior null
// -> EDITION_2014, #1559): see assertNoCharactersReferenceStaleSubclasses's
// own comment for why upsertEditionRow's create-not-update-in-place behavior
// makes this necessary, and why the character guard above must run BEFORE
// any delete. Same "prune wiring lands in the SAME deploy as the fork"
// requirement as seedActions' #1430 (see its own stale-row comment).
//
// `seeded` (never a bare read of the module-level SUBCLASSES) restricts this
// to slugs the CALLER still emits — deliberately NOT the bare
// staleCatalogRowsWhere("slug", seeded) every other caller uses (which owns
// its ENTIRE table). Subclass can hold rows from a lineage retired entirely
// (a rename that dropped a slug outright, not just re-tagged its edition)
// that a live character's nullable subclassId FK still references; a blanket
// sweep would delete those too — this prune only ever removes a row whose
// OWN slug is still seeded, under an edition no longer wanted for it. A slug
// the seed has stopped emitting altogether is untouched and left for its own
// deliberate fix (the three orphaned monk-way-of-* rows, #1559 disclosure).
export async function pruneStaleSubclasses(
  prisma: PrismaClient,
  seeded: readonly { slug: string; edition: SeedEdition | null }[],
): Promise<void> {
  const seededSlugs = seeded.map((s) => s.slug);
  const staleWhere = staleCatalogRowsWhere(
    "slug",
    seeded.map((s) => ({ identity: s.slug, edition: s.edition })),
    { slug: { in: seededSlugs } },
  );
  const stale = await prisma.subclass.findMany({ where: staleWhere, select: { id: true, slug: true, edition: true } });
  const staleRows: StaleSubclassRow[] = stale.map((s) => ({ id: s.id, slug: s.slug, edition: s.edition as SeedEdition | null }));

  await assertNoCharactersReferenceStaleSubclasses(prisma, staleRows);

  if (stale.length) {
    console.log(`seedSubclasses: dropping stale catalog rows: ${stale.map((s) => `${s.slug} (${s.edition ?? "shared"})`).join(", ")}`);
  }
  await prisma.subclass.deleteMany({ where: staleWhere });
}

// Upsert by (slug, edition) — the immutable identity key (#1277), not
// (classId, name, edition): keying on slug is what makes a display-name
// RENAME a pure content edit (renaming `sub.name` alone under a name-keyed
// upsert would miss the find, `create` a duplicate row, and hit the new
// slug_edition index — see R3). `classId`/`name` still flow through as UPDATE
// fields so a rename actually lands on the existing row. Prisma's compound-key
// `where: { slug_edition: {...} }` shorthand can't express a null edition (see
// upsertEditionRow), so this finds-then-writes instead.
export async function seedSubclasses(prisma: PrismaClient, classIds: Map<string, string>): Promise<void> {
  for (const sub of SUBCLASSES) {
    const classId = classIds.get(sub.className);
    if (!classId) throw new Error(`Seed error: unknown class "${sub.className}" in SUBCLASSES`);
    const edition = sub.edition ?? null;
    await upsertEditionRow(
      prisma.subclass,
      { slug: sub.slug, edition },
      { classId, name: sub.name, description: sub.description, slug: sub.slug, edition },
      { classId, name: sub.name, description: sub.description },
    );
  }
  await pruneStaleSubclasses(
    prisma,
    SUBCLASSES.map((s) => ({ slug: s.slug, edition: s.edition ?? null })),
  );
}
