// DB-backed proof for #1559's character-data guard
// (assertNoCharactersReferenceStaleSubclasses, seed-subclasses.ts): a subclass
// retag gives the seeded slug a NEW row id — upsertEditionRow's `where`
// includes `edition`, so retagging a previously-shared row (Path of the Totem
// Warrior, null -> EDITION_2014) finds no match and CREATES rather than
// updates in place, leaving the OLD row for pruneStaleSubclasses to drop.
// CharacterClassEntry.subclassRef is `onDelete: SetNull` (schema.prisma), so
// without a guard that delete would SILENTLY null out a live character's
// subclass instead of erroring — the failure class this file exists to
// close. Harmless for Totem Warrior today (zero characters reference it,
// verified) but every remaining 2024 retab will retag a subclass characters
// DO have.
//
// Uses this vitest worker's own isolated test database (never the dev
// database) to create real Character/CharacterClassEntry rows — every
// fixture row below uses a class name/slug unique to this file, so nothing
// here touches the real seeded catalog.
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

// Builds the exact pre-retag-to-post-retag sequence: a shared (edition: null)
// row with a live character on it, then the retag itself (a NEW row created
// under the seed's wanted edition, mirroring what seedSubclasses does when
// SUBCLASSES.edition changes for an already-seeded slug).
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
  // This case used to assert the prune REFUSED here. It no longer does, and the
  // change is deliberate: #1233's Archfey/Great Old One retag hit this against
  // a populated staging database and wedged every Railway deploy, because
  // railway.json runs `prisma db seed` as its preDeployCommand and the guard's
  // "remap the rows, then re-run" advice is a manual step no deploy can take.
  //
  // The guard's PURPOSE is intact. It exists to stop `onDelete: SetNull`
  // silently ERASING a live character's subclass; remapping onto the retained
  // row for the same slug preserves that subclass exactly, because a slug is a
  // subclass's immutable identity (#1277) and the two rows differ only in
  // edition tag. What follows is the assertion that matters: the character
  // still has its subclass afterwards.
  it("remaps a live character onto the retained row instead of refusing, preserving its subclass", async () => {
    const { oldRow, newRow } = await seedRetagFixture();

    // seeded = [{ slug: SLUG, edition: "EDITION_2014" }] is exactly the shape
    // seedSubclasses passes: the seed now wants EDITION_2014 for this slug, so
    // the OLD (shared) row is stale — and a live character still points at it.
    await expect(pruneStaleSubclasses(prisma, [{ slug: SLUG, edition: "EDITION_2014" }])).resolves.toBeUndefined();

    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    // NOT null — the failure mode this whole file exists to close — and not
    // left dangling on the deleted row either.
    expect(entry.subclassId).toBe(newRow.id);
    expect(entry.subclassId).not.toBe(oldRow.id);
    expect(entry.subclass).toBe("Fixture Subclass");

    expect(await prisma.subclass.findUnique({ where: { id: oldRow.id } })).toBeNull();
  });

  // The remap moves the FK and NOTHING else. `CharacterClassEntry.subclass` is
  // a deliberately drifting display name (schema.prisma: "free to diverge from
  // the catalog row's name"), and buildClassesView emits THAT column rather
  // than the joined row's name — so overwriting it during a seed run would
  // silently replace a name the player chose, the same class of user-data
  // mutation this file's guard exists to prevent.
  //
  // The case above cannot catch a regression here: both its rows are named
  // "Fixture Subclass", so an implementation that DID overwrite the column
  // would still pass it. This one gives the retained row a different name and
  // the entry a player-customised one, so only leaving the column alone works.
  it("moves the FK only — a drifting subclass display name survives the remap", async () => {
    const { oldRow } = await seedRetagFixture();
    await prisma.characterClassEntry.updateMany({
      where: { characterId: CHAR_ID },
      data: { subclass: "My Homebrewed Patron" },
    });
    // The retained row is renamed too, so "keep the entry's text" and "copy the
    // row's name" are now distinguishable outcomes.
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

  // The half that is still refused. Two retained rows under one slug is a
  // genuine choice between them, not a mechanical repoint, so the remap
  // declines and the guard throws exactly as before — automating the safe case
  // must not quietly guess at the unsafe one.
  it("still refuses when the slug has MORE than one retained row, naming slug/edition/count", async () => {
    const { oldRow } = await seedRetagFixture();
    const classId = await ensureFixtureClass();
    // A second retained row for the same slug — now "the retained row" is
    // ambiguous, so nothing may be remapped automatically.
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

    // Refusing to prune means refusing to mutate — the entry's subclassId
    // must be EXACTLY what it was, not nulled and not repointed.
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    expect(entry.subclassId).toBe(oldRow.id);
    expect(await prisma.subclass.findUnique({ where: { id: oldRow.id } })).not.toBeNull();
  });

  it("prunes cleanly once no CharacterClassEntry references the old row", async () => {
    const { oldRow } = await seedRetagFixture();
    await prisma.character.deleteMany({ where: { id: CHAR_ID } }); // the only referencing entry, gone

    await expect(pruneStaleSubclasses(prisma, [{ slug: SLUG, edition: "EDITION_2014" }])).resolves.toBeUndefined();

    expect(await prisma.subclass.findUnique({ where: { id: oldRow.id } })).toBeNull();
  });

  // Documents WHY the guard above exists, independent of this file's own
  // production code: onDelete: SetNull is real Postgres/Prisma behavior, not
  // a hypothetical — deleting the old row directly (the "no guard" case)
  // silently nulls the character's subclass rather than erroring.
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
