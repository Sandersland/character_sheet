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

// How a Subclass row's edition reads in this file's four operator-facing
// messages — NULL is "shared" (offered to both editions), not "none". Extracted
// because every `?? ` is its own branch under fallow's cyclomatic count, and
// prisma/seed/** carries no coverage instrumentation (vitest.config.ts scopes
// coverage.include to src/**), so a function here floors at the UNCOVERED CRAP
// formula CC^2+CC no matter how well tested it actually is. Splitting the
// branch out is the only lever that moves it — the same reasoning
// countReferencingBySubclassId and staleRowFailureMessages below already carry.
function editionLabel(edition: SeedEdition | null): string {
  return edition ?? "shared";
}

// Groups CharacterClassEntry's (subclassId) row counts into "how many
// referencing rows per stale subclass id" — split out purely to keep each
// function's own cyclomatic/cognitive complexity low. prisma/seed/** carries
// no vitest coverage instrumentation (vitest.config.ts scopes coverage.include
// to src/**/*.ts), so a function here floors at the UNCOVERED CRAP formula
// CC^2+CC regardless of real test coverage — splitting branches down is the
// only lever, not adding tests (see baseFeatureRows' comment, class-features.ts,
// and groupPresentEditionsBySubclassId's twin role, seed-class-features.ts).
function countReferencingBySubclassId(
  referencing: readonly { subclassId: string | null; _count: { _all: number } }[],
): Map<string, number> {
  const countBySubclassId = new Map<string, number>();
  for (const r of referencing) {
    if (r.subclassId) countBySubclassId.set(r.subclassId, r._count._all);
  }
  return countBySubclassId;
}

// Same complexity reasoning as countReferencingBySubclassId above.
function staleRowFailureMessages(stale: readonly StaleSubclassRow[], countBySubclassId: Map<string, number>): string[] {
  return stale
    .filter((s) => countBySubclassId.has(s.id))
    .map((s) => `  ${s.slug} (${editionLabel(s.edition)}): ${countBySubclassId.get(s.id)} referencing CharacterClassEntry row(s)`);
}

// The failure throw, isolated so assertNoCharactersReferenceStaleSubclasses'
// own body carries only the two branches deciding WHETHER to call this — same
// complexity reasoning as the two helpers above. This message (not the two
// pure helpers) is the load-bearing part a future retab author actually
// reads: `onDelete: SetNull` is what makes the silent-null failure mode
// possible, and a retag is what gives the seeded slug a NEW row id in the
// first place (upsertEditionRow creates rather than updates in place, Totem
// Warrior null -> EDITION_2014, #1559) — a reader hits this comment before
// the delete that would otherwise silently mutate a character.
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

// Parameterized on the stale-row list rather than reading SUBCLASSES
// directly, so a test can fabricate a retag against its OWN fixture subclass
// in isolation from the real 31-row catalog — the same "call the underlying
// primitive directly" idiom action-fork-reseed.test.ts uses, since seed.ts
// can't be re-invoked from a test (it self-invokes main() at module load).
// (The other two relations FROM catalog rows TO Subclass —
// ClassFeature.subclass, SubclassGrantedSpell.subclass — are `onDelete:
// Cascade` and rewritten by their own seeders in the SAME run, so they need
// no guard here; only CharacterClassEntry reaches user data.)
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

// Re-points live characters off a stale row onto the retained row for the SAME
// SLUG, so a retag stops wedging deploys (`railway.json`'s preDeployCommand is
// `prisma migrate deploy && prisma db seed`, so the guard below aborting the
// seed fails the whole deploy — and its "remap, then re-run" advice is a manual
// runbook step no deploy can perform). #1233's Archfey/Great Old One retag hit
// exactly this against a populated staging database.
//
// This does NOT weaken #1559's guard, because it cannot cause the harm that
// guard exists to prevent. A slug IS a subclass's immutable identity (#1277) —
// the stale row and the retained row are the same subclass differing only in
// edition tag — so re-pointing the FK preserves the character's subclass
// exactly, where `onDelete: SetNull` would have erased it. And by construction
// a retained row exists for every row this prune can reach: pruneStaleSubclasses
// scopes itself to slugs the seed still emits (see its own comment), so a slug
// retired outright is never a candidate here.
//
// Deliberately ONLY the unambiguous case. Two or more retained rows for one
// slug (a same-slug fork seeded under BOTH editions) is a genuine choice
// between them, not a mechanical repoint, so those are left untouched for the
// guard to reject — automating the safe half must not quietly guess at the
// unsafe half.
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

    // ONLY the FK. `CharacterClassEntry.subclass` — the display name — is
    // deliberately left alone: schema.prisma calls it a "Drifting subclass
    // display name — free to diverge from the catalog row's name", and
    // buildClassesView emits THAT column (not the joined row's name) as what
    // the player sees. Writing `retained[0].name` here would silently overwrite
    // a name the player chose, during a seed run, which is the same class of
    // user-data mutation #1559's guard exists to prevent. A retag that also
    // renames therefore leaves the sheet reading the old name — correct, and
    // the player's to change.
    const { count } = await prisma.characterClassEntry.updateMany({
      where: { subclassId: row.id },
      data: { subclassId: retained[0].id },
    });
    if (count > 0) {
      // Loud, not silent: a deploy that moves live character rows should say so
      // in its log, and the edition it moved them ONTO is the detail someone
      // debugging a cross-edition sheet later will want.
      console.log(
        `seedSubclasses: remapped ${count} CharacterClassEntry row(s) for ${row.slug} ` +
          `from the stale (${editionLabel(row.edition)}) row onto the retained ` +
          `(${editionLabel(retained[0].edition)}) row before pruning (#1559)`,
      );
    }
  }
}

// Detector for #1598: a live character whose held subclass row's `edition`
// no longer matches its OWN (Character.rulesEdition) — the state
// remapCharactersOffStaleSubclasses deliberately PRESERVES rather than nulls
// (a pre-retag pick under a since-retagged, now edition-tagged row). Unlike
// assertNoCharactersReferenceStaleSubclasses above, this is not a reason to
// fail the seed/deploy: buildClassesView (#1598 chunk 1) marks the entry at
// read time (subclassUnavailable) and the sheet explains it, so there is
// nothing here to repair automatically — only something to report, so a
// future retab (wave C, #1336) surfaces its blast radius instead of shipping
// silent dead-end sheets. Runs AFTER the remap/prune above, so a row THAT
// retag stranded is already counted correctly against the NEW catalog state.
//
// Prisma has no field-to-field comparison in a `where` (see
// withEditionOrShared's own comment on the same limitation), so this compares
// Character.rulesEdition against the joined Subclass.edition in memory —
// one query, not a per-character round trip, and both tables are seed/dev-
// scale today.
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

  // Loud, not silent — same tone as the remap log above: an operator watching
  // a deploy's seed output should see exactly which characters this touches.
  console.log(
    [
      `seedSubclasses: ${stranded.length} character(s) hold a subclass row edition-tagged for a ` +
        "DIFFERENT edition than their own (#1598) — buildClassesView marks EVERY such entry " +
        "(subclassUnavailable) rather than silently rendering zero subclass features, but the " +
        "sheet only offers the re-pick on a character's PRIMARY class entry, so a stranded " +
        "MULTICLASS secondary entry below is reported here and nowhere else (#1602):",
      ...stranded.map((e) => {
        const name = e.subclass ?? e.subclassRef!.name; // subclass: drifting display name (schema.prisma) — prefer it, catalog name is the fallback
        return `  ${e.character.name} (${e.character.id}, ${editionLabel(e.character.rulesEdition as SeedEdition)}): ` +
          `${name} (${editionLabel(e.subclassRef!.edition as SeedEdition | null)})`;
      }),
    ].join("\n"),
  );
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

  // Remap FIRST, then assert: the guard is the backstop for whatever the remap
  // could not resolve safely (an ambiguous same-slug fork), not the first line
  // of defence any more.
  await remapCharactersOffStaleSubclasses(prisma, staleRows);
  await assertNoCharactersReferenceStaleSubclasses(prisma, staleRows);

  if (stale.length) {
    console.log(`seedSubclasses: dropping stale catalog rows: ${stale.map((s) => `${s.slug} (${editionLabel(s.edition)})`).join(", ")}`);
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
// #1531: casterFraction/spellcastingAbility default to NULL (the schema
// column default) for every subclass that doesn't set them — `?? null` here
// is an explicit write of that default, not a fallback guess. Split out of
// seedSubclasses purely to keep that function's own cyclomatic count low:
// prisma/seed/** carries no vitest coverage instrumentation (vitest.config.ts
// scopes coverage.include to src/**), so a function here floors at the
// UNCOVERED CRAP formula CC^2+CC no matter how well tested it actually is —
// same reasoning as this file's own editionLabel/countReferencingBySubclassId
// splits above (and seed-class-features.ts's groupPresentEditionsBySubclassId).
function casterIdentityOf(sub: { casterFraction?: "third"; spellcastingAbility?: string }): {
  casterFraction: "third" | null;
  spellcastingAbility: string | null;
} {
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
  await pruneStaleSubclasses(
    prisma,
    SUBCLASSES.map((s) => ({ slug: s.slug, edition: s.edition ?? null })),
  );
  await reportStrandedSubclassCharacters(prisma);
}
