// reportUnseededSubclassRows reports (never deletes) a Subclass row whose slug the seed no longer emits at all; pruneStaleSubclasses only removes rows under a slug the seed still emits (#1562).
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";

import { reportUnseededSubclassRows } from "../seed-subclasses.js";
import { SUBCLASSES } from "../subclasses.js";

const OWNER_ID = "owner-unseeded-subclass-detector-1562";
const FIXTURE_CLASS_NAME = "ZzzUnseededDetectorClass1562";
const ORPHAN_SLUG = "zzz-unseeded-orphan-1562";
const SEEDED_SLUG = "zzz-unseeded-still-seeded-1562";

// The test db carries the real seeded catalog too, so REAL_SEEDED_SLUGS must include SUBCLASSES, not just this file's fixture slug, or every real row misreads as an orphan.
const REAL_SEEDED_SLUGS = SUBCLASSES.map((s) => s.slug);

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

async function createCharacterOnSubclass(
  id: string,
  name: string,
  classId: string,
  subclassId: string,
  subclassName: string,
) {
  await ensureTestOwner(OWNER_ID);
  await prisma.character.create({
    data: {
      id,
      name,
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
      rulesEdition: "EDITION_2014",
      classEntries: {
        create: [{ name: "fixture", classId, position: 0, level: 3, subclass: subclassName, subclassId }],
      },
    },
  });
}

afterEach(async () => {
  await prisma.character.deleteMany({ where: { ownerId: OWNER_ID } });
  await prisma.subclass.deleteMany({ where: { slug: { in: [ORPHAN_SLUG, SEEDED_SLUG] } } });
});

afterAll(async () => {
  await prisma.characterClass.deleteMany({ where: { name: FIXTURE_CLASS_NAME } });
});

describe("reportUnseededSubclassRows (#1562)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("does not name this fixture's own row when its slug is still seeded", async () => {
    // Not asserting total silence — the detector scans the whole table, so a real pre-existing orphan could also log. Only this fixture's own row must never be named.
    const classId = await ensureFixtureClass();
    await prisma.subclass.create({
      data: { classId, name: "Fixture Still Seeded", description: "still seeded", slug: SEEDED_SLUG, edition: "EDITION_2014" },
    });

    await reportUnseededSubclassRows(prisma, [...REAL_SEEDED_SLUGS, SEEDED_SLUG]);

    const messages = logSpy.mock.calls.map((call) => call[0] as string);
    expect(messages.join("\n")).not.toContain(SEEDED_SLUG);
  });

  it("reports an orphan row's slug and edition, and does not delete it", async () => {
    const classId = await ensureFixtureClass();
    const orphan = await prisma.subclass.create({
      data: { classId, name: "Fixture Orphan", description: "no longer seeded", slug: ORPHAN_SLUG, edition: "EDITION_2014" },
    });

    await reportUnseededSubclassRows(prisma, REAL_SEEDED_SLUGS);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const message = logSpy.mock.calls[0]![0] as string;
    expect(message).toContain(ORPHAN_SLUG);
    expect(message).toContain("EDITION_2014");
    expect(message).toContain("#1562");

    const stillThere = await prisma.subclass.findUnique({ where: { id: orphan.id } });
    expect(stillThere).not.toBeNull();
  });

  it("reports how many characters still reference the orphan row, and leaves their subclass pick untouched", async () => {
    const classId = await ensureFixtureClass();
    const orphan = await prisma.subclass.create({
      data: { classId, name: "Fixture Orphan", description: "no longer seeded", slug: ORPHAN_SLUG, edition: "EDITION_2014" },
    });
    await createCharacterOnSubclass("zzz-unseeded-1562", "Orphaned Probe", classId, orphan.id, "Fixture Orphan");

    await reportUnseededSubclassRows(prisma, REAL_SEEDED_SLUGS);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const message = logSpy.mock.calls[0]![0] as string;
    expect(message).toContain("1 referencing CharacterClassEntry row");

    const entry = await prisma.characterClassEntry.findFirst({ where: { characterId: "zzz-unseeded-1562" } });
    expect(entry?.subclassId).toBe(orphan.id);
  });
});
