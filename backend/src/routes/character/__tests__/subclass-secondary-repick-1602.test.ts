/**
 * #1602: a stranded cross-edition subclass on a multiclass SECONDARY entry
 * must be repairable through the same setSubclass op the primary entry
 * already uses. #1598 built the explanation and the re-pick, but only wired
 * them to the character's primary class entry on the frontend. The backend
 * write path was already entry-scoped (setSubclass resolves its target by
 * the subclass's own classId, not by position, #1065) — this test proves
 * that end to end through the real HTTP transaction route, starting from a
 * stranded secondary entry rather than a fresh pick.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-1602-secondary-repick";
let COOKIE: string;

let wizardId: string;
let warlockId: string;
let archfeyId: string; // Warlock/The Archfey — EDITION_2014-only (#1233 retag)
let fiendId: string; // Warlock/The Fiend — shared, valid under EDITION_2024

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);

  wizardId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } })).id;
  warlockId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Warlock" } })).id;
  archfeyId = (await prisma.subclass.findFirstOrThrow({
    where: { classId: warlockId, slug: "warlock-the-archfey" },
  })).id;
  fiendId = (await prisma.subclass.findFirstOrThrow({
    where: { classId: warlockId, slug: "warlock-the-fiend" },
  })).id;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "1602 Secondary Repick" } } });
});

async function strandedMulticlassCharacter() {
  const character = await prisma.character.create({
    data: {
      name: "1602 Secondary Repick Fixture",
      alignment: "True Neutral",
      ownerId: OWNER_ID,
      rulesEdition: "EDITION_2024",
      experiencePoints: 6500, // derived total level 5 (wizard 2 + warlock 3)
      initiativeBonus: 0,
      speed: 30,
      hitPoints: { current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 5, die: "d8", spent: 0 },
      abilityScores: { strength: 10, dexterity: 12, constitution: 14, intelligence: 15, wisdom: 10, charisma: 14 },
      savingThrowProficiencies: [],
      skills: [],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      classEntries: {
        create: [
          { name: "Wizard", classId: wizardId, position: 0, level: 2 },
          // Warlock 3 meets the EDITION_2024 subclass gate (level 3 for every
          // class) — already stranded on the 2014-only Archfey row, the same
          // state a live #1233 retag leaves behind.
          { name: "Warlock", classId: warlockId, position: 1, level: 3, subclass: "The Archfey", subclassId: archfeyId },
        ],
      },
    },
    include: { classEntries: { orderBy: { position: "asc" } } },
  });
  return character;
}

function get(id: string) {
  return supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE);
}

describe("re-picking a stranded SECONDARY class entry's subclass (#1602)", () => {
  it("GET marks the secondary Warlock entry stranded while the primary Wizard entry is unaffected", async () => {
    const character = await strandedMulticlassCharacter();
    const res = await get(character.id);
    expect(res.status).toBe(200);

    const classes = res.body.classes as { name: string; subclass?: string; needsSubclass: boolean; subclassUnavailable: boolean }[];
    const wizard = classes.find((c) => c.name === "Wizard")!;
    const warlock = classes.find((c) => c.name === "Warlock")!;

    expect(warlock.subclass).toBe("The Archfey");
    expect(warlock.subclassUnavailable).toBe(true);
    expect(warlock.needsSubclass).toBe(true);
    expect(wizard.subclassUnavailable).toBe(false);
  });

  it("setSubclass repairs the stranded SECONDARY entry without touching the primary entry", async () => {
    const character = await strandedMulticlassCharacter();
    const primaryEntryId = character.classEntries[0].id;
    const secondaryEntryId = character.classEntries[1].id;

    const patch = await supertest(app)
      .post(`/api/characters/${character.id}/class/transactions`)
      .set("Cookie", COOKIE)
      .send({ operations: [{ type: "setSubclass", subclassId: fiendId }] });
    expect(patch.status).toBe(200);

    const classes = patch.body.classes as { name: string; subclass?: string; needsSubclass: boolean; subclassUnavailable: boolean }[];
    const warlock = classes.find((c) => c.name === "Warlock")!;
    expect(warlock.subclass).toBe("The Fiend");
    expect(warlock.subclassUnavailable).toBe(false);
    expect(warlock.needsSubclass).toBe(false);

    const secondaryEntry = await prisma.characterClassEntry.findUniqueOrThrow({ where: { id: secondaryEntryId } });
    expect(secondaryEntry.subclassId).toBe(fiendId);

    // Position independence (#1065): the op must resolve by the subclass's
    // own classId, not by roster position — the primary entry stays untouched.
    const primaryEntry = await prisma.characterClassEntry.findUniqueOrThrow({ where: { id: primaryEntryId } });
    expect(primaryEntry.subclassId).toBeNull();
  });
});
