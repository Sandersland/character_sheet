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

function editionLabel(edition: SeedEdition | null): string {
  return edition ?? "shared";
}

function countReferencingBySubclassId(
  referencing: readonly { subclassId: string | null; _count: { _all: number } }[],
): Map<string, number> {
  const countBySubclassId = new Map<string, number>();
  for (const r of referencing) {
    if (r.subclassId) countBySubclassId.set(r.subclassId, r._count._all);
  }
  return countBySubclassId;
}

function staleRowFailureMessages(stale: readonly StaleSubclassRow[], countBySubclassId: Map<string, number>): string[] {
  return stale
    .filter((s) => countBySubclassId.has(s.id))
    .map((s) => `  ${s.slug} (${editionLabel(s.edition)}): ${countBySubclassId.get(s.id)} referencing CharacterClassEntry row(s)`);
}

function throwStaleSubclassReferencedError(messages: readonly string[]): never {
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

// Only CharacterClassEntry needs this guard: ClassFeature.subclass and
// SubclassGrantedSpell.subclass are onDelete: Cascade and rewritten by their
// own seeders in the same run.
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
  const countBySubclassId = countReferencingBySubclassId(referencing);
  const messages = staleRowFailureMessages(stale, countBySubclassId);
  if (messages.length > 0) throwStaleSubclassReferencedError(messages);
}

async function remapCharactersOffStaleSubclasses(
  prisma: PrismaClient,
  stale: readonly StaleSubclassRow[],
): Promise<void> {
  for (const row of stale) {
    const retained = await prisma.subclass.findMany({
      where: { slug: row.slug, id: { not: row.id } },
      select: { id: true, edition: true },
    });
    if (retained.length !== 1) continue;

    // CharacterClassEntry.subclass is a drifting display name (schema.prisma)
    // — buildClassesView reads it, not the joined row's name, so it's
    // deliberately left unwritten here.
    const { count } = await prisma.characterClassEntry.updateMany({
      where: { subclassId: row.id },
      data: { subclassId: retained[0].id },
    });
    if (count > 0) {
      console.log(
        `seedSubclasses: remapped ${count} CharacterClassEntry row(s) for ${row.slug} ` +
          `from the stale (${editionLabel(row.edition)}) row onto the retained ` +
          `(${editionLabel(retained[0].edition)}) row before pruning (#1559)`,
      );
    }
  }
}

// Report-only: buildClassesView marks a stranded entry at read time
// (subclassUnavailable), so there is nothing to repair here.
// Prisma can't compare two fields in a `where` (see withEditionOrShared) —
// this joins Character.rulesEdition against Subclass.edition in memory instead.
export async function reportStrandedSubclassCharacters(prisma: PrismaClient): Promise<void> {
  const entries = await prisma.characterClassEntry.findMany({
    where: { subclassId: { not: null } },
    select: {
      subclass: true,
      character: { select: { id: true, name: true, rulesEdition: true } },
      subclassRef: { select: { name: true, edition: true } },
    },
  });
  const stranded = entries.filter(
    (e) => e.subclassRef?.edition != null && e.subclassRef.edition !== e.character.rulesEdition,
  );
  if (stranded.length === 0) return;

  console.log(
    [
      `seedSubclasses: ${stranded.length} character(s) hold a subclass row edition-tagged for a ` +
        "DIFFERENT edition than their own (#1598) — buildClassesView marks EVERY such entry " +
        "(subclassUnavailable) and the sheet offers a re-pick on every affected class entry, " +
        "primary or secondary (#1602). Logged anyway so an operator watching a deploy sees " +
        "exactly which characters this touches:",
      ...stranded.map((e) => {
        const name = e.subclass ?? e.subclassRef!.name; // subclass: drifting display name (schema.prisma) — prefer it, catalog name is the fallback
        return `  ${e.character.name} (${e.character.id}, ${editionLabel(e.character.rulesEdition as SeedEdition)}): ` +
          `${name} (${editionLabel(e.subclassRef!.edition as SeedEdition | null)})`;
      }),
    ].join("\n"),
  );
}

// Slugs the seed no longer emits at all (a rename that dropped them
// outright) — pruneStaleSubclasses only touches slugs still emitted.
// Report-only; deleting would silently clear affected characters' subclass
// (CharacterClassEntry.subclassRef is onDelete: SetNull).
export async function reportUnseededSubclassRows(
  prisma: PrismaClient,
  seededSlugs: readonly string[],
): Promise<void> {
  const orphans = await prisma.subclass.findMany({
    where: { slug: { notIn: [...seededSlugs] } },
    select: { id: true, slug: true, edition: true },
  });
  if (orphans.length === 0) return;

  const referencing = await prisma.characterClassEntry.groupBy({
    by: ["subclassId"],
    where: { subclassId: { in: orphans.map((o) => o.id) } },
    _count: { _all: true },
  });
  const countBySubclassId = countReferencingBySubclassId(referencing);

  console.log(
    [
      `seedSubclasses: ${orphans.length} Subclass row(s) exist that the seed no longer emits (#1562) —`,
      ...orphans.map(
        (o) =>
          `  ${o.slug} (${editionLabel(o.edition as SeedEdition | null)}): ` +
          `${countBySubclassId.get(o.id) ?? 0} referencing CharacterClassEntry row(s)`,
      ),
      "This is a report only. Nothing was deleted or changed.",
    ].join("\n"),
  );
}

// Scoped to slugs still seeded (unlike the bare staleCatalogRowsWhere other
// callers use) — a slug dropped entirely is reportUnseededSubclassRows's job
// (#1562), not this prune's.
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

  // Remap first — the guard is only the backstop for what remap can't
  // resolve safely.
  await remapCharactersOffStaleSubclasses(prisma, staleRows);
  await assertNoCharactersReferenceStaleSubclasses(prisma, staleRows);

  if (stale.length) {
    console.log(`seedSubclasses: dropping stale catalog rows: ${stale.map((s) => `${s.slug} (${editionLabel(s.edition)})`).join(", ")}`);
  }
  await prisma.subclass.deleteMany({ where: staleWhere });
}

// Keys the upsert on (slug, edition) — the immutable identity (#1277), not
// (classId, name) — so a display-name rename lands as an update, not a new
// row. Prisma's `slug_edition` compound-key shorthand can't express a null
// edition (see upsertEditionRow), hence the find-then-write here.
function casterIdentityOf(sub: { casterFraction?: "third"; spellcastingAbility?: string }): {
  casterFraction: "third" | null;
  spellcastingAbility: string | null;
} {
  // `?? null` is an explicit write of the schema's NULL default (#1531), not
  // a fallback guess.
  return { casterFraction: sub.casterFraction ?? null, spellcastingAbility: sub.spellcastingAbility ?? null };
}

export async function seedSubclasses(prisma: PrismaClient, classIds: Map<string, string>): Promise<void> {
  for (const sub of SUBCLASSES) {
    const classId = classIds.get(sub.className);
    if (!classId) throw new Error(`Seed error: unknown class "${sub.className}" in SUBCLASSES`);
    const edition = sub.edition ?? null;
    const { casterFraction, spellcastingAbility } = casterIdentityOf(sub);
    await upsertEditionRow(
      prisma.subclass,
      { slug: sub.slug, edition },
      { classId, name: sub.name, description: sub.description, slug: sub.slug, edition, casterFraction, spellcastingAbility },
      { classId, name: sub.name, description: sub.description, casterFraction, spellcastingAbility },
    );
  }
  const seededSubclasses = SUBCLASSES.map((s) => ({ slug: s.slug, edition: s.edition ?? null }));
  await pruneStaleSubclasses(prisma, seededSubclasses);
  await reportStrandedSubclassCharacters(prisma);
  await reportUnseededSubclassRows(
    prisma,
    seededSubclasses.map((s) => s.slug),
  );
}
