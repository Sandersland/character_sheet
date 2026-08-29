import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { seedSubclassSpellListExpansions } from "../seed-spell-list-expansions.js";
import type { SubclassSpellListExpansionSeed } from "../subclass-spell-list-expansions.js";

const FIXTURE_CLASS_NAME = "ZzzExpansionForkProbeClass1631";
const SUBCLASS_NAME = "Fixture Expansion Subclass";
const BYSTANDER_SUBCLASS_NAME = "Fixture Expansion Bystander Subclass";
const SLUG = "zzz-expansion-fork-probe-1631";
const BYSTANDER_SLUG = "zzz-expansion-fork-probe-bystander-1631";

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
    data: { classId: classIds.get(FIXTURE_CLASS_NAME)!, name, description: "expansion fork probe", slug, edition },
  });
  return row.id;
}

function expansion(over: Partial<SubclassSpellListExpansionSeed> = {}): SubclassSpellListExpansionSeed {
  return {
    className: FIXTURE_CLASS_NAME,
    subclassName: SUBCLASS_NAME,
    spellName: "Minor Illusion",
    ...over,
  };
}

// Cascades each fixture subclass's expansion rows too (Subclass onDelete: Cascade).
afterEach(async () => {
  await prisma.subclass.deleteMany({ where: { slug: { in: [SLUG, BYSTANDER_SLUG] } } });
});

afterAll(async () => {
  await prisma.characterClass.deleteMany({ where: { name: FIXTURE_CLASS_NAME } });

  const fiendExpansions = await prisma.subclassSpellListExpansion.count({
    where: { subclass: { slug: "warlock-the-fiend" } },
  });
  expect(fiendExpansions, "the real seeded expansion rows must survive this suite").toBeGreaterThan(0);
});

describe("seedSubclassSpellListExpansions — retag and prune (#1631)", () => {
  it("a retag from shared (NULL) to a per-edition fork drops the stale shared row on reseed", async () => {
    const subclassId = await makeSubclass(SUBCLASS_NAME, SLUG, null);
    const classIds = await ensureFixtureClass();

    await seedSubclassSpellListExpansions(prisma, classIds, [expansion()]);
    const shared = await prisma.subclassSpellListExpansion.findMany({ where: { subclassId } });
    expect(shared).toHaveLength(1);
    expect(shared[0].edition).toBeNull();

    await seedSubclassSpellListExpansions(prisma, classIds, [
      expansion({ edition: "EDITION_2014" }),
      expansion({ edition: "EDITION_2024", spellName: "Elementalism" }),
    ]);

    const rows = await prisma.subclassSpellListExpansion.findMany({ where: { subclassId }, orderBy: { edition: "asc" } });
    expect(rows.map((r) => r.edition).sort()).toEqual(["EDITION_2014", "EDITION_2024"]);
  });

  it("reseeding is idempotent: a second identical run updates in place, minting no new row ids", async () => {
    await makeSubclass(SUBCLASS_NAME, SLUG, null);
    const classIds = await ensureFixtureClass();
    const rows = [expansion(), expansion({ spellName: "Elementalism" })];

    await seedSubclassSpellListExpansions(prisma, classIds, rows);
    const first = await prisma.subclassSpellListExpansion.findMany({ where: { subclass: { slug: SLUG } }, orderBy: { spellId: "asc" } });
    await seedSubclassSpellListExpansions(prisma, classIds, rows);
    const second = await prisma.subclassSpellListExpansion.findMany({ where: { subclass: { slug: SLUG } }, orderBy: { spellId: "asc" } });

    expect(second.map((r) => r.id)).toEqual(first.map((r) => r.id));
  });

  it("the prune never touches a subclass the run did not write onto (fixture/homebrew rows are out of scope)", async () => {
    await makeSubclass(SUBCLASS_NAME, SLUG, null);
    const bystanderId = await makeSubclass(BYSTANDER_SUBCLASS_NAME, BYSTANDER_SLUG, null);
    const spell = await prisma.spell.findFirstOrThrow({ where: { name: "Minor Illusion" }, select: { id: true } });
    await prisma.subclassSpellListExpansion.create({
      data: { subclassId: bystanderId, spellId: spell.id, edition: null },
    });

    const classIds = await ensureFixtureClass();
    await seedSubclassSpellListExpansions(prisma, classIds, [expansion()]);

    const bystanderRows = await prisma.subclassSpellListExpansion.findMany({ where: { subclassId: bystanderId } });
    expect(bystanderRows, "an expansion row on a never-seeded subclass must survive the prune").toHaveLength(1);
  });
});

describe("upsertExpansionSpell — the edition-aware subclass resolve (#1631)", () => {
  it("a tagged row lands on the exact-edition Subclass fork when one exists, else the shared row", async () => {
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
    await seedSubclassSpellListExpansions(prisma, classIds, [
      expansion({ edition: "EDITION_2024" }),
      expansion({ edition: "EDITION_2014", spellName: "Elementalism" }),
    ]);

    const on2024Fork = await prisma.subclassSpellListExpansion.findMany({ where: { subclassId: forkedSubclassId } });
    expect(on2024Fork.map((r) => r.edition)).toEqual(["EDITION_2024"]);
    // With no EDITION_2014 fork, resolveEditionRow's exact-else-NULL fallback lands the 2014 row on the shared subclass.
    const onShared = await prisma.subclassSpellListExpansion.findMany({ where: { subclassId: sharedSubclassId } });
    expect(onShared.map((r) => r.edition)).toEqual(["EDITION_2014"]);
  });

  it("a shared row over a subclass name that exists only as per-edition forks is a hard seed error", async () => {
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

    await expect(seedSubclassSpellListExpansions(prisma, classIds, [expansion()])).rejects.toThrow(/shared \(untagged\) list-expansion/);
  });

  it("a shared row onto a SOLE tagged candidate is admitted (the Archfey/Great Old One shape, #1233)", async () => {
    const soleId = await makeSubclass(SUBCLASS_NAME, SLUG, "EDITION_2014");
    const classIds = await ensureFixtureClass();

    await seedSubclassSpellListExpansions(prisma, classIds, [expansion()]);

    const rows = await prisma.subclassSpellListExpansion.findMany({ where: { subclassId: soleId } });
    expect(rows.map((r) => r.edition)).toEqual([null]);
  });
});
