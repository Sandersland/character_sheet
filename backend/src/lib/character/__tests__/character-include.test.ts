// #1524: characterInclude's widened `class`/`subclassRef` relations
// (lib/character/character-include.ts) load ClassFeature rows (#1522/#1523)
// for the derivation to read. The `subclassId: null` filter on the `class`
// side is load-bearing — ClassFeature.classId is required on subclass rows
// too, so an unfiltered `class.features` would return every subclass under
// that class. This is DB-backed (real seeded Fighter/Battle Master/Champion/
// Eldritch Knight rows), not a fixture, per the issue's own warning that this
// filter is "the single most likely place this loop goes wrong." Characters
// are created through the real API (like subclass-feature-edition-1374.test.ts)
// so every NOT NULL column production requires gets filled the same way.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-1524-character-include";
let COOKIE: string;
const app = createApp();

const ABILITY_SCORES = {
  strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8,
};

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "1524 Include" } } });
});

async function createFighter(name: string, subclassName: string | null): Promise<string> {
  const res = await supertest(app)
    .post("/api/characters")
    .set("Cookie", COOKIE)
    .send({
      name,
      alignment: "True Neutral",
      race: "Hill Dwarf",
      background: "Soldier",
      classes: [{ name: "Fighter" }],
      abilityScores: ABILITY_SCORES,
      rulesEdition: "EDITION_2024",
    });
  expect(res.status).toBe(201);
  const id = res.body.id as string;

  // Level 3 — subclass active in both editions (subclassGateLevel's >= 3 gate).
  await prisma.character.update({ where: { id }, data: { experiencePoints: 900 } });

  if (subclassName) {
    const fighterClass = await prisma.characterClass.findUniqueOrThrow({ where: { name: "Fighter" } });
    const subclass = await prisma.subclass.findFirstOrThrow({ where: { classId: fighterClass.id, name: subclassName } });
    await prisma.characterClassEntry.updateMany({
      where: { characterId: id },
      data: { subclass: subclassName, subclassId: subclass.id },
    });
  }
  return id;
}

describe("characterInclude loads ClassFeature rows scoped correctly (#1524)", () => {
  it("class.features carries ONLY subclassId-null (base-class) rows — Second Wind/Action Surge, never a subclass feature", async () => {
    const id = await createFighter("1524 Include Fighter Battle Master", "Battle Master");

    const row = await prisma.character.findUniqueOrThrow({ where: { id }, include: characterInclude });
    const classFeatures = row.classEntries[0].class?.features ?? [];

    expect(classFeatures.length).toBeGreaterThan(0);
    expect(classFeatures.every((f) => f.subclassId === null)).toBe(true);
    const names = new Set(classFeatures.map((f) => f.name));
    expect(names.has("Second Wind")).toBe(true);
    expect(names.has("Action Surge")).toBe(true);
    // Anti-vacuity: a Battle Master feature must be ABSENT from class.features —
    // proves the filter actually excludes rows that share this classId, not just
    // that base rows happen to be present.
    expect(names.has("Combat Superiority")).toBe(false);
  });

  it("a Battle Master's subclassRef.features carries ITS OWN rows only — never Champion's or Eldritch Knight's", async () => {
    const id = await createFighter("1524 Include Fighter Battle Master 2", "Battle Master");

    const row = await prisma.character.findUniqueOrThrow({ where: { id }, include: characterInclude });
    const subclassFeatures = row.classEntries[0].subclassRef?.features ?? [];

    expect(subclassFeatures.length).toBeGreaterThan(0);
    const names = new Set(subclassFeatures.map((f) => f.name));
    expect(names.has("Combat Superiority")).toBe(true);
    // Anti-vacuity: a sibling subclass's feature must be absent.
    expect(names.has("Improved Critical")).toBe(false); // Champion
    expect(names.has("Weapon Bond")).toBe(false); // Eldritch Knight
  });

  it("a Champion Fighter's class.features is IDENTICAL to a Battle Master's — the base-class rows don't depend on subclass", async () => {
    const battleMasterId = await createFighter("1524 Include Fighter BM Compare", "Battle Master");
    const championId = await createFighter("1524 Include Fighter Champion Compare", "Champion");

    const bmRow = await prisma.character.findUniqueOrThrow({ where: { id: battleMasterId }, include: characterInclude });
    const championRow = await prisma.character.findUniqueOrThrow({ where: { id: championId }, include: characterInclude });

    const bmNames = new Set((bmRow.classEntries[0].class?.features ?? []).map((f) => f.name));
    const championNames = new Set((championRow.classEntries[0].class?.features ?? []).map((f) => f.name));
    expect(bmNames).toEqual(championNames);

    const championSubclassNames = new Set((championRow.classEntries[0].subclassRef?.features ?? []).map((f) => f.name));
    expect(championSubclassNames.has("Improved Critical")).toBe(true);
    expect(championSubclassNames.has("Combat Superiority")).toBe(false);
  });

  it("both editions' rows load (the include can't filter by rulesEdition) — class.features contains both EDITION_2014 and EDITION_2024 rows for a name shared by both", async () => {
    const id = await createFighter("1524 Include Fighter Edition Both", null);

    const row = await prisma.character.findUniqueOrThrow({ where: { id }, include: characterInclude });
    const classFeatures = row.classEntries[0].class?.features ?? [];
    const secondWindEditions = classFeatures.filter((f) => f.name === "Second Wind").map((f) => f.edition);
    expect(new Set(secondWindEditions)).toEqual(new Set(["EDITION_2014", "EDITION_2024"]));
  });
});
