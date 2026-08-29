// reportStrandedSubclassCharacters reports (never throws) a live character whose subclass row's edition no longer matches the character's own rulesEdition — state remapCharactersOffStaleSubclasses (#1559) deliberately preserves and buildClassesView's subclassUnavailable marks rather than repairs (#1598).
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";

import { reportStrandedSubclassCharacters } from "../seed-subclasses.js";

const OWNER_ID = "owner-stranded-subclass-detector-1598";
const FIXTURE_CLASS_NAME = "ZzzStrandedDetectorClass1598";
const SLUG = "zzz-stranded-detector-1598";

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
  rulesEdition: "EDITION_2014" | "EDITION_2024",
  classId: string,
  subclassId: string | null,
  subclassName: string | null,
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
      rulesEdition,
      classEntries: {
        create: [{ name: "fixture", classId, position: 0, level: 3, subclass: subclassName, subclassId }],
      },
    },
  });
}

afterEach(async () => {
  await prisma.character.deleteMany({ where: { ownerId: OWNER_ID } });
  await prisma.subclass.deleteMany({ where: { slug: SLUG } });
});

afterAll(async () => {
  await prisma.characterClass.deleteMany({ where: { name: FIXTURE_CLASS_NAME } });
});

describe("reportStrandedSubclassCharacters (#1598)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("resolves without throwing and logs nothing when no character references any subclass", async () => {
    await expect(reportStrandedSubclassCharacters(prisma)).resolves.toBeUndefined();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("reports a character whose subclass row's edition differs from its own, naming character and subclass", async () => {
    const classId = await ensureFixtureClass();
    const row = await prisma.subclass.create({
      data: { classId, name: "Fixture Patron", description: "2014-only", slug: SLUG, edition: "EDITION_2014" },
    });
    await createCharacterOnSubclass("zzz-stranded-1598", "Stranded Probe", "EDITION_2024", classId, row.id, "Fixture Patron");

    await reportStrandedSubclassCharacters(prisma);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const message = logSpy.mock.calls[0]![0] as string;
    expect(message).toContain("Stranded Probe");
    expect(message).toContain("zzz-stranded-1598");
    expect(message).toContain("Fixture Patron");
    expect(message).toContain("#1598");
  });

  it("does NOT report a character whose subclass edition matches its own", async () => {
    const classId = await ensureFixtureClass();
    const row = await prisma.subclass.create({
      data: { classId, name: "Fixture Patron", description: "2024", slug: SLUG, edition: "EDITION_2024" },
    });
    await createCharacterOnSubclass("zzz-stranded-1598", "Healthy Probe", "EDITION_2024", classId, row.id, "Fixture Patron");

    await reportStrandedSubclassCharacters(prisma);

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("does NOT report a character on a SHARED (edition: null) subclass row, regardless of its own edition", async () => {
    const classId = await ensureFixtureClass();
    const row = await prisma.subclass.create({
      data: { classId, name: "Fixture Patron", description: "shared", slug: SLUG, edition: null },
    });
    await createCharacterOnSubclass("zzz-stranded-1598", "Shared Probe", "EDITION_2014", classId, row.id, "Fixture Patron");

    await reportStrandedSubclassCharacters(prisma);

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("does NOT report a character with no subclass chosen", async () => {
    const classId = await ensureFixtureClass();
    await createCharacterOnSubclass("zzz-stranded-1598", "No Subclass Probe", "EDITION_2024", classId, null, null);

    await reportStrandedSubclassCharacters(prisma);

    expect(logSpy).not.toHaveBeenCalled();
  });
});
