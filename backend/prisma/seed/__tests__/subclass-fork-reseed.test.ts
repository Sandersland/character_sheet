// DB-backed proof for #1559's Subclass prune: seedSubclasses gained a
// stale-row cleanup so retagging an EXISTING subclass's edition (Path of the
// Totem Warrior, null -> EDITION_2014) doesn't strand its old row —
// upsertEditionRow's `where` includes `edition`, so a retag finds no match
// and CREATES a new row instead of updating in place (verified empirically
// against a throwaway DB before this file existed). PLUS the deliberate
// scoping that keeps this prune from ever touching a slug the seed has
// stopped emitting altogether — the shape of the three orphaned
// `monk-way-of-*` rows disclosed in #1559 (a past rename to
// `monk-warrior-of-*`, out of scope here, still referenced by two real
// characters via a nullable FK). A blanket slug-not-in-SUBCLASSES sweep would
// silently null out those characters' subclassId (onDelete: SetNull) — this
// suite proves that never happens.
//
// Modelled on action-fork-reseed.test.ts — seed.ts exports nothing and
// self-invokes main() at module load, so a test cannot import and re-run
// seedSubclasses; calling upsertEditionRow and staleCatalogRowsWhere with the
// exact shapes seedSubclasses passes proves the same properties directly.
//
// Fixture rules: every destructive call is scoped with `extraWhere` to this
// file's own fixture class — staleCatalogRowsWhere means "everything NOT in
// the seeded list", so an unscoped call would eat the real Subclass catalog
// out from under every other test in the same vitest worker.
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

import { staleCatalogRowsWhere } from "../prune.js";

const FIXTURE_CLASS_NAME = "ZzzSubclassForkProbeClass1559";
const SLUG = "zzz-subclass-fork-probe-1559";
// Stands in for the real monk-way-of-* shape: a slug the seed has stopped
// emitting AT ALL, not merely retagged — the prune must never touch it.
const RETIRED_SLUG = "zzz-subclass-fork-probe-retired-1559";
const ONLY_THIS_FILES_ROWS = { slug: { in: [SLUG, RETIRED_SLUG] } };

let classId: string;

async function ensureFixtureClass(): Promise<string> {
  const cls = await prisma.characterClass.upsert({
    where: { name: FIXTURE_CLASS_NAME },
    create: {
      name: FIXTURE_CLASS_NAME,
      hitDie: "d8",
      savingThrows: ["strength", "dexterity"],
      skillChoiceCount: 2,
      skillChoices: ["acrobatics", "stealth"],
      isSpellcaster: false,
      subclassLevel: 3,
    },
    update: {},
  });
  return cls.id;
}

afterEach(async () => {
  await prisma.subclass.deleteMany({ where: ONLY_THIS_FILES_ROWS });
});

// Cascades off CharacterClass's onDelete: Cascade — deleting the fixture
// class removes every fixture Subclass row too.
afterAll(async () => {
  await prisma.characterClass.deleteMany({ where: { name: FIXTURE_CLASS_NAME } });

  // Proves the scoping above held: if any test leaked past its own fixture
  // rows, the real catalog is gone and this is what goes red.
  const totemWarrior = await prisma.subclass.findFirst({ where: { slug: "barbarian-totem-warrior" } });
  expect(totemWarrior, "the real seeded Subclass catalog must survive this suite").not.toBeNull();
});

describe("upsertEditionRow retagging an existing subclass's edition (#1559)", () => {
  it("a retag from shared (null) to an exact edition creates a NEW row and leaves the old one behind", async () => {
    classId = await ensureFixtureClass();
    const shared = await upsertEditionRow(
      prisma.subclass,
      { slug: SLUG, edition: null },
      { classId, name: "Fixture Subclass", description: "shared", slug: SLUG, edition: null },
      { classId, name: "Fixture Subclass", description: "shared" },
    );

    // The retag seedSubclasses performs when SUBCLASSES.edition changes.
    await upsertEditionRow(
      prisma.subclass,
      { slug: SLUG, edition: "EDITION_2014" },
      { classId, name: "Fixture Subclass", description: "2014-only", slug: SLUG, edition: "EDITION_2014" },
      { classId, name: "Fixture Subclass", description: "2014-only" },
    );

    const rows = await prisma.subclass.findMany({ where: { slug: SLUG }, orderBy: { edition: "asc" } });
    // Both rows exist — the old shared one was never updated in place.
    expect(rows.map((r) => r.edition).sort()).toEqual([null, "EDITION_2014"].sort());
    expect(rows.find((r) => r.edition === null)!.id).toBe(shared.id);
  });
});

describe("seedSubclasses' prune — both directions (#1559)", () => {
  // Direction A: the exact shape seedSubclasses passes. A retagged slug's OLD
  // row is dropped; the new one survives, stably across repeated (idempotent)
  // prune runs.
  it("drops the stranded old-edition row a retag leaves behind, keeping only the currently-seeded edition", async () => {
    classId = await ensureFixtureClass();
    await prisma.subclass.create({
      data: { classId, name: "Fixture Subclass", description: "shared", slug: SLUG, edition: null },
    });
    await prisma.subclass.create({
      data: { classId, name: "Fixture Subclass", description: "2014-only", slug: SLUG, edition: "EDITION_2014" },
    });

    const seeded = [{ identity: SLUG, edition: "EDITION_2014" as const }];
    for (let run = 0; run < 2; run += 1) {
      // extraWhere restricted to SLUG alone simulates seedSubclasses' own
      // `{ slug: { in: seededSlugs } }` — RETIRED_SLUG isn't in scope, and
      // SLUG being fixture-only already keeps this from touching the real
      // catalog, so no need to also merge in ONLY_THIS_FILES_ROWS here.
      const staleWhere = staleCatalogRowsWhere("slug", seeded, { slug: { in: [SLUG] } });
      await prisma.subclass.deleteMany({ where: staleWhere });
    }

    const surviving = await prisma.subclass.findMany({ where: { slug: SLUG } });
    expect(surviving).toHaveLength(1);
    expect(surviving[0].edition).toBe("EDITION_2014");
  });

  // Direction B: the scoping that protects an orphaned, no-longer-emitted
  // slug (the real monk-way-of-* shape) from a blanket sweep. seedSubclasses
  // ANDs `{ slug: { in: seededSlugs } }` into staleCatalogRowsWhere's
  // extraWhere — a slug entirely absent from that seeded set must survive
  // even though it would otherwise match every edition partition's `notIn`.
  it("never touches a slug the seed has stopped emitting at all, even though it matches every notIn partition", async () => {
    classId = await ensureFixtureClass();
    await prisma.subclass.create({
      data: { classId, name: "Retired Fixture Subclass", description: "orphan", slug: RETIRED_SLUG, edition: null },
    });

    // seedSubclasses' real shape: SUBCLASSES no longer mentions RETIRED_SLUG
    // at all, so `seeded` here (mirroring the seed's own map) has no entry
    // for it — but the seededSlugs extraWhere (SLUG only) excludes it from
    // scope entirely, the same way SUBCLASSES.map(s => s.slug) would.
    const seeded = [{ identity: SLUG, edition: "EDITION_2014" as const }];
    const staleWhere = staleCatalogRowsWhere("slug", seeded, { slug: { in: [SLUG] } });
    await prisma.subclass.deleteMany({ where: staleWhere });

    const stillThere = await prisma.subclass.findFirst({ where: { slug: RETIRED_SLUG } });
    expect(stillThere, "an orphaned, no-longer-emitted slug must never be pruned by this scoped call").not.toBeNull();
  });

  // The unscoped shape, for contrast: WITHOUT the `slug: { in: seededSlugs }`
  // restriction, the retired row above WOULD be dropped — proving the
  // restriction in seedSubclasses' actual call is load-bearing, not
  // decorative.
  it("an unscoped call (no seededSlugs restriction) WOULD drop the retired slug — the restriction seedSubclasses adds is load-bearing", async () => {
    classId = await ensureFixtureClass();
    await prisma.subclass.create({
      data: { classId, name: "Retired Fixture Subclass", description: "orphan", slug: RETIRED_SLUG, edition: null },
    });

    const seeded = [{ identity: SLUG, edition: "EDITION_2014" as const }];
    // Only the fixture-scoping extraWhere, deliberately omitting the
    // seededSlugs restriction — this is the shape seedSubclasses does NOT use.
    const staleWhere = staleCatalogRowsWhere("slug", seeded, ONLY_THIS_FILES_ROWS);
    await prisma.subclass.deleteMany({ where: staleWhere });

    const stillThere = await prisma.subclass.findFirst({ where: { slug: RETIRED_SLUG } });
    expect(stillThere).toBeNull();
  });
});
