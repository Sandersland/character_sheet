// #1562's seed-time detector: reportUnseededSubclassRows (seed-subclasses.ts)
// reports (never deletes) a Subclass row whose slug the seed no longer
// emits at all — for example after a rename drops the old slug outright,
// rather than just changing which edition it is tagged for.
// pruneStaleSubclasses only ever removes a row under a slug the seed STILL
// emits (see its own comment), so a row like this survives every seed run
// until a human decides what to do with it and any characters that still
// reference it.
//
// Uses this vitest worker's own isolated test database (never the dev
// database) — every fixture row below uses a class name/slug unique to this
// file, so nothing here touches the real seeded catalog.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";

import { reportUnseededSubclassRows } from "../seed-subclasses.js";
import { SUBCLASSES } from "../subclasses.js";

const OWNER_ID = "owner-unseeded-subclass-detector-1562";
const FIXTURE_CLASS_NAME = "ZzzUnseededDetectorClass1562";
const ORPHAN_SLUG = "zzz-unseeded-orphan-1562";
const SEEDED_SLUG = "zzz-unseeded-still-seeded-1562";

// The test database this worker uses carries the REAL seeded catalog (other
// integration tests depend on it), so "still seeded" here means the real
// SUBCLASSES list plus this file's own fixture slug — not just the fixture
// slug alone, or every real row would misread as an orphan.
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

  it("logs nothing when every Subclass row's slug is still seeded", async () => {
    const classId = await ensureFixtureClass();
    await prisma.subclass.create({
      data: { classId, name: "Fixture Still Seeded", description: "still seeded", slug: SEEDED_SLUG, edition: "EDITION_2014" },
    });

    await reportUnseededSubclassRows(prisma, [...REAL_SEEDED_SLUGS, SEEDED_SLUG]);

    expect(logSpy).not.toHaveBeenCalled();
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
