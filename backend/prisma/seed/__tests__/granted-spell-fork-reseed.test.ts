// DB-backed proof for #1625's granted-spell seeder: the edition-aware subclass
// resolve that replaced upsertGrantedSpell's findFirst+orderBy latch, and the
// id-scoped prune that makes a grant retag (NULL -> per-edition fork) drop its
// stale shared row on reseed — upsertEditionRow's `where` includes `edition`,
// so a retag finds no match and CREATES a new row instead of updating in
// place (the same shape subclass-fork-reseed.test.ts proves for Subclass).
//
// Unlike that file, seedSubclassGrantedSpells IS importable (split into
// seed-granted-spells.ts) and parameterized on its grants, so this drives the
// real seeder against fixture rows rather than re-implementing its call
// shapes.
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { seedSubclassGrantedSpells } from "../seed-granted-spells.js";
import type { SubclassGrantedSpellSeed } from "../subclass-granted-spells.js";

const FIXTURE_CLASS_NAME = "ZzzGrantForkProbeClass1625";
const SUBCLASS_NAME = "Fixture Grant Subclass";
const BYSTANDER_SUBCLASS_NAME = "Fixture Bystander Subclass";
const SLUG = "zzz-grant-fork-probe-1625";
const BYSTANDER_SLUG = "zzz-grant-fork-probe-bystander-1625";

async function ensureFixtureClass(): Promise<Map<string, string>> {
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
  return new Map([[FIXTURE_CLASS_NAME, cls.id]]);
}

async function makeSubclass(name: string, slug: string, edition: "EDITION_2014" | "EDITION_2024" | null): Promise<string> {
  const classIds = await ensureFixtureClass();
  const row = await prisma.subclass.create({
    data: { classId: classIds.get(FIXTURE_CLASS_NAME)!, name, description: "grant fork probe", slug, edition },
  });
  return row.id;
}

function grant(over: Partial<SubclassGrantedSpellSeed> = {}): SubclassGrantedSpellSeed {
  return {
    className: FIXTURE_CLASS_NAME,
    subclassName: SUBCLASS_NAME,
    spellName: "Minor Illusion",
    gateLevel: 3,
    castingAbility: "wisdom",
    ...over,
  };
}

// Cascades each fixture subclass's grant rows too (Subclass onDelete: Cascade).
afterEach(async () => {
  await prisma.subclass.deleteMany({ where: { slug: { in: [SLUG, BYSTANDER_SLUG] } } });
});

afterAll(async () => {
  await prisma.characterClass.deleteMany({ where: { name: FIXTURE_CLASS_NAME } });

  // Proves the prune's slug scoping held: if a test's seeded set leaked, the
  // real seeded grants are gone and this goes red.
  const lifeDomainGrants = await prisma.subclassGrantedSpell.count({
    where: { subclass: { slug: "cleric-life-domain" } },
  });
  expect(lifeDomainGrants, "the real seeded grant rows must survive this suite").toBeGreaterThan(0);
});

describe("seedSubclassGrantedSpells — retag and prune (#1625)", () => {
  it("a grant retag from shared (NULL) to a per-edition fork drops the stale shared row on reseed", async () => {
    const subclassId = await makeSubclass(SUBCLASS_NAME, SLUG, null);
    const classIds = await ensureFixtureClass();

    await seedSubclassGrantedSpells(prisma, classIds, [grant()]);
    const shared = await prisma.subclassGrantedSpell.findMany({ where: { subclassId } });
    expect(shared).toHaveLength(1);
    expect(shared[0].edition).toBeNull();

    // The retag: the one shared row forks into a per-edition pair (the #1626
    // shape — same spell, different gateLevel per edition, ONE Subclass row).
    await seedSubclassGrantedSpells(prisma, classIds, [
      grant({ edition: "EDITION_2014", gateLevel: 3 }),
      grant({ edition: "EDITION_2024", gateLevel: 5 }),
    ]);

    const rows = await prisma.subclassGrantedSpell.findMany({ where: { subclassId }, orderBy: { gateLevel: "asc" } });
    expect(rows.map((r) => ({ edition: r.edition, gateLevel: r.gateLevel }))).toEqual([
      { edition: "EDITION_2014", gateLevel: 3 },
      { edition: "EDITION_2024", gateLevel: 5 },
    ]);
  });

  it("reseeding is idempotent: a second identical run updates in place, minting no new row ids", async () => {
    await makeSubclass(SUBCLASS_NAME, SLUG, null);
    const classIds = await ensureFixtureClass();
    const grants = [grant(), grant({ spellName: "Elementalism", gateLevel: 5 })];

    await seedSubclassGrantedSpells(prisma, classIds, grants);
    const first = await prisma.subclassGrantedSpell.findMany({ where: { subclass: { slug: SLUG } }, orderBy: { gateLevel: "asc" } });
    await seedSubclassGrantedSpells(prisma, classIds, grants);
    const second = await prisma.subclassGrantedSpell.findMany({ where: { subclass: { slug: SLUG } }, orderBy: { gateLevel: "asc" } });

    expect(second.map((r) => r.id)).toEqual(first.map((r) => r.id));
  });

  it("the prune never touches a subclass the run did not grant onto (fixture/homebrew rows are out of scope)", async () => {
    await makeSubclass(SUBCLASS_NAME, SLUG, null);
    const bystanderId = await makeSubclass(BYSTANDER_SUBCLASS_NAME, BYSTANDER_SLUG, null);
    const spell = await prisma.spell.findFirstOrThrow({ where: { name: "Minor Illusion" }, select: { id: true } });
    await prisma.subclassGrantedSpell.create({
      data: { subclassId: bystanderId, spellId: spell.id, gateLevel: 3, castingAbility: "wisdom", edition: null },
    });

    const classIds = await ensureFixtureClass();
    await seedSubclassGrantedSpells(prisma, classIds, [grant()]);

    const bystanderRows = await prisma.subclassGrantedSpell.findMany({ where: { subclassId: bystanderId } });
    expect(bystanderRows, "a grant row on a never-seeded subclass must survive the prune").toHaveLength(1);
  });
});

describe("upsertGrantedSpell — the edition-aware subclass resolve that replaced the orderBy latch (#1625)", () => {
  it("a tagged grant lands on the exact-edition Subclass fork when one exists, else the shared row", async () => {
    const sharedSubclassId = await makeSubclass(SUBCLASS_NAME, SLUG, null);
    // A same-slug edition fork of the SAME subclass lineage (#1306).
    const forkedSubclassId = await prisma.subclass
      .create({
        data: {
          classId: (await ensureFixtureClass()).get(FIXTURE_CLASS_NAME)!,
          name: SUBCLASS_NAME,
          description: "2024 fork",
          slug: SLUG,
          edition: "EDITION_2024",
        },
      })
      .then((r) => r.id);

    const classIds = await ensureFixtureClass();
    await seedSubclassGrantedSpells(prisma, classIds, [
      grant({ edition: "EDITION_2024" }),
      grant({ edition: "EDITION_2014", spellName: "Elementalism" }),
    ]);

    const on2024Fork = await prisma.subclassGrantedSpell.findMany({ where: { subclassId: forkedSubclassId } });
    expect(on2024Fork.map((r) => r.edition)).toEqual(["EDITION_2024"]);
    // No EDITION_2014 Subclass fork exists, so the 2014 grant falls back to
    // the shared row — the same exact-else-NULL ordering resolveEditionRow
    // gives a character of that edition.
    const onShared = await prisma.subclassGrantedSpell.findMany({ where: { subclassId: sharedSubclassId } });
    expect(onShared.map((r) => r.edition)).toEqual(["EDITION_2014"]);
  });

  it("a shared grant over a subclass name that exists only as per-edition forks is a hard seed error", async () => {
    await makeSubclass(SUBCLASS_NAME, SLUG, "EDITION_2014");
    const classIds = await ensureFixtureClass();
    await prisma.subclass.create({
      data: {
        classId: classIds.get(FIXTURE_CLASS_NAME)!,
        name: SUBCLASS_NAME,
        description: "2024 fork",
        slug: SLUG,
        edition: "EDITION_2024",
      },
    });

    await expect(seedSubclassGrantedSpells(prisma, classIds, [grant()])).rejects.toThrow(/shared \(untagged\) grant/);
  });

  it("a shared grant onto a SOLE tagged candidate is admitted (the Archfey/Great Old One shape, #1233)", async () => {
    const soleId = await makeSubclass(SUBCLASS_NAME, SLUG, "EDITION_2014");
    const classIds = await ensureFixtureClass();

    await seedSubclassGrantedSpells(prisma, classIds, [grant()]);

    const rows = await prisma.subclassGrantedSpell.findMany({ where: { subclassId: soleId } });
    expect(rows.map((r) => r.edition)).toEqual([null]);
  });
});
