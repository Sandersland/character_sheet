// CharacterClassEntry.subclassRef is onDelete: SetNull (schema.prisma), so deleting a referenced Subclass row silently nulls a live character's subclass instead of erroring (#1559).
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

import { assertNoCharactersReferenceStaleSubclasses, pruneStaleSubclasses } from "../seed-subclasses.js";

const OWNER_ID = "owner-subclass-retag-guard-1559";
const FIXTURE_CLASS_NAME = "ZzzSubclassRetagGuardClass1559";
const SLUG = "zzz-subclass-retag-guard-1559";
const CHAR_ID = "zzz-subclass-retag-guard-char-1559";

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

async function seedRetagFixture() {
  const classId = await ensureFixtureClass();
  await ensureTestOwner(OWNER_ID);

  const oldRow = await prisma.subclass.create({
    data: { classId, name: "Fixture Subclass", description: "shared", slug: SLUG, edition: null },
  });

  await prisma.character.create({
    data: {
      id: CHAR_ID,
      name: "Retag Guard Probe",
      alignment: "Lawful Neutral",
      experiencePoints: 0,
      initiativeBonus: 0,
      speed: 30,
      hitPoints: { current: 10, max: 10, temp: 0 },
      hitDice: { total: 1, die: "d8" },
      abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      savingThrowProficiencies: [],
      skills: [],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      ownerId: OWNER_ID,
      spellcasting: { slotsUsed: {}, spells: [] },
      classEntries: {
        create: [
          { name: "fixture", classId, position: 0, level: 1, subclass: "Fixture Subclass", subclassId: oldRow.id },
        ],
      },
    },
  });

  const newRow = await upsertEditionRow(
    prisma.subclass,
    { slug: SLUG, edition: "EDITION_2014" },
    { classId, name: "Fixture Subclass", description: "2014-only", slug: SLUG, edition: "EDITION_2014" },
    { classId, name: "Fixture Subclass", description: "2014-only" },
  );

  return { oldRow, newRow };
}

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: CHAR_ID } });
  await prisma.subclass.deleteMany({ where: { slug: SLUG } });
});

afterAll(async () => {
  await prisma.characterClass.deleteMany({ where: { name: FIXTURE_CLASS_NAME } });
});

describe("assertNoCharactersReferenceStaleSubclasses / pruneStaleSubclasses (#1559)", () => {
  // Slug is a subclass's immutable identity (#1277); the two rows differ only by edition.
  it("remaps a live character onto the retained row instead of refusing, preserving its subclass", async () => {
    const { oldRow, newRow } = await seedRetagFixture();

    await expect(pruneStaleSubclasses(prisma, [{ slug: SLUG, edition: "EDITION_2014" }])).resolves.toBeUndefined();

    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    // Not null, and not left pointing at the deleted row.
    expect(entry.subclassId).toBe(newRow.id);
    expect(entry.subclassId).not.toBe(oldRow.id);
    expect(entry.subclass).toBe("Fixture Subclass");

    expect(await prisma.subclass.findUnique({ where: { id: oldRow.id } })).toBeNull();
  });

  // CharacterClassEntry.subclass is a deliberately drifting display name (schema.prisma); buildClassesView reads that column, not the joined row's name.
  it("moves the FK only — a drifting subclass display name survives the remap", async () => {
    const { oldRow } = await seedRetagFixture();
    await prisma.characterClassEntry.updateMany({
      where: { characterId: CHAR_ID },
      data: { subclass: "My Homebrewed Patron" },
    });
    await prisma.subclass.updateMany({
      where: { slug: SLUG, edition: "EDITION_2014" },
      data: { name: "Renamed In The Catalog" },
    });

    await expect(pruneStaleSubclasses(prisma, [{ slug: SLUG, edition: "EDITION_2014" }])).resolves.toBeUndefined();

    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    expect(entry.subclass).toBe("My Homebrewed Patron");
    expect(entry.subclass).not.toBe("Renamed In The Catalog");
    expect(await prisma.subclass.findUnique({ where: { id: oldRow.id } })).toBeNull();
  });

  // Two retained rows under one slug is ambiguous, so the remap refuses rather than guessing.
  it("still refuses when the slug has MORE than one retained row, naming slug/edition/count", async () => {
    const { oldRow } = await seedRetagFixture();
    const classId = await ensureFixtureClass();
    await prisma.subclass.create({
      data: {
        classId,
        name: "Fixture Subclass",
        description: "2024-only",
        slug: SLUG,
        edition: "EDITION_2024",
      },
    });

    await expect(
      pruneStaleSubclasses(prisma, [
        { slug: SLUG, edition: "EDITION_2014" },
        { slug: SLUG, edition: "EDITION_2024" },
      ]),
    ).rejects.toThrow(new RegExp(`${SLUG} \\(shared\\): 1 referencing CharacterClassEntry row\\(s\\)`));

    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    expect(entry.subclassId).toBe(oldRow.id);
    expect(await prisma.subclass.findUnique({ where: { id: oldRow.id } })).not.toBeNull();
  });

  it("prunes cleanly once no CharacterClassEntry references the old row", async () => {
    const { oldRow } = await seedRetagFixture();
    await prisma.character.deleteMany({ where: { id: CHAR_ID } });

    await expect(pruneStaleSubclasses(prisma, [{ slug: SLUG, edition: "EDITION_2014" }])).resolves.toBeUndefined();

    expect(await prisma.subclass.findUnique({ where: { id: oldRow.id } })).toBeNull();
  });

  it("documents the danger the guard prevents: deleting the old row directly (no guard) silently nulls the character's subclass", async () => {
    const { oldRow } = await seedRetagFixture();

    await prisma.subclass.delete({ where: { id: oldRow.id } });

    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    expect(entry.subclassId).toBeNull();
  });
});

describe("assertNoCharactersReferenceStaleSubclasses — called directly (#1559)", () => {
  it("resolves without throwing for an empty stale-row list", async () => {
    await expect(assertNoCharactersReferenceStaleSubclasses(prisma, [])).resolves.toBeUndefined();
  });

  it("resolves without throwing when the stale row has no referencing CharacterClassEntry", async () => {
    const classId = await ensureFixtureClass();
    const row = await prisma.subclass.create({
      data: { classId, name: "Fixture Subclass", description: "unreferenced", slug: SLUG, edition: null },
    });

    await expect(
      assertNoCharactersReferenceStaleSubclasses(prisma, [{ id: row.id, slug: SLUG, edition: null }]),
    ).resolves.toBeUndefined();
  });

  it("throws directly for a stale row a CharacterClassEntry references, naming slug/edition/count", async () => {
    const { oldRow } = await seedRetagFixture();

    await expect(
      assertNoCharactersReferenceStaleSubclasses(prisma, [{ id: oldRow.id, slug: SLUG, edition: null }]),
    ).rejects.toThrow(new RegExp(`${SLUG} \\(shared\\): 1 referencing CharacterClassEntry row\\(s\\)`));

    // Calling the guard alone never mutates anything — it only inspects.
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    expect(entry.subclassId).toBe(oldRow.id);
  });
});
