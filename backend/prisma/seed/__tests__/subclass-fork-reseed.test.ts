// upsertEditionRow's `where` includes `edition`, so retagging an existing row's edition creates a new row rather than updating in place.
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

import { staleCatalogRowsWhere } from "../prune.js";

const FIXTURE_CLASS_NAME = "ZzzSubclassForkProbeClass1559";
const SLUG = "zzz-subclass-fork-probe-1559";
// Simulates a slug the seed has stopped emitting entirely (the real monk-way-of-* case) — the prune must never touch it.
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

// Cascades off CharacterClass's onDelete: Cascade — deleting the fixture class removes every fixture Subclass row too.
afterAll(async () => {
  await prisma.characterClass.deleteMany({ where: { name: FIXTURE_CLASS_NAME } });

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
    expect(rows.map((r) => r.edition).sort()).toEqual([null, "EDITION_2014"].sort());
    expect(rows.find((r) => r.edition === null)!.id).toBe(shared.id);
  });
});

describe("seedSubclasses' prune — both directions (#1559)", () => {
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
      // extraWhere here simulates seedSubclasses' own `{ slug: { in: seededSlugs } }`; SLUG being fixture-only already excludes the real catalog.
      const staleWhere = staleCatalogRowsWhere("slug", seeded, { slug: { in: [SLUG] } });
      await prisma.subclass.deleteMany({ where: staleWhere });
    }

    const surviving = await prisma.subclass.findMany({ where: { slug: SLUG } });
    expect(surviving).toHaveLength(1);
    expect(surviving[0].edition).toBe("EDITION_2014");
  });

  // staleCatalogRowsWhere ANDs `{ slug: { in: seededSlugs } }` into extraWhere, so a slug absent from that set survives even though it matches every edition partition's `notIn`.
  it("never touches a slug the seed has stopped emitting at all, even though it matches every notIn partition", async () => {
    classId = await ensureFixtureClass();
    await prisma.subclass.create({
      data: { classId, name: "Retired Fixture Subclass", description: "orphan", slug: RETIRED_SLUG, edition: null },
    });

    const seeded = [{ identity: SLUG, edition: "EDITION_2014" as const }];
    const staleWhere = staleCatalogRowsWhere("slug", seeded, { slug: { in: [SLUG] } });
    await prisma.subclass.deleteMany({ where: staleWhere });

    const stillThere = await prisma.subclass.findFirst({ where: { slug: RETIRED_SLUG } });
    expect(stillThere, "an orphaned, no-longer-emitted slug must never be pruned by this scoped call").not.toBeNull();
  });

  it("an unscoped call (no seededSlugs restriction) WOULD drop the retired slug — the restriction seedSubclasses adds is load-bearing", async () => {
    classId = await ensureFixtureClass();
    await prisma.subclass.create({
      data: { classId, name: "Retired Fixture Subclass", description: "orphan", slug: RETIRED_SLUG, edition: null },
    });

    const seeded = [{ identity: SLUG, edition: "EDITION_2014" as const }];
    const staleWhere = staleCatalogRowsWhere("slug", seeded, ONLY_THIS_FILES_ROWS);
    await prisma.subclass.deleteMany({ where: staleWhere });

    const stillThere = await prisma.subclass.findFirst({ where: { slug: RETIRED_SLUG } });
    expect(stillThere).toBeNull();
  });
});
