// resolveStartingGold rejects a NULL-dice package rather than silently computing a range (#1564) — PHB'24 packages have goldDiceCount/Faces/Multiplier jointly NULL, making mode: "gold" a 2014-only path. A fixture class keeps the reject-path assertion independent of any one class's seeded content.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesId } from "@/test-support/species.js";

const OWNER_ID = "owner-starting-equipment-null-gold";
let COOKIE: string;

const FIXTURE_CLASS = {
  name: "Zzz Fixture Null Gold Class (#1564)",
  hitDie: "d8",
  savingThrows: ["dexterity"],
  skillChoiceCount: 0,
  skillChoices: [] as string[],
  isSpellcaster: false,
};

let fixtureClassId: string;
let human2014Id: string;
const createdCharacterIds: string[] = [];

describe("resolveStartingGold rejects a NULL-dice package (#1564)", () => {
  beforeAll(async () => {
    human2014Id = await seededSpeciesId("Human", "EDITION_2014");
    const cls = await prisma.characterClass.upsert({
      where: { name: FIXTURE_CLASS.name },
      create: FIXTURE_CLASS,
      update: FIXTURE_CLASS,
    });
    fixtureClassId = cls.id;

    await prisma.startingEquipmentPackage.create({
      data: {
        classId: fixtureClassId,
        name: FIXTURE_CLASS.name,
        edition: "EDITION_2014",
        goldDiceCount: null,
        goldDiceFaces: null,
        goldMultiplier: null,
        groups: {
          create: [
            {
              position: 0,
              label: "(a) a dagger or (b) 10 gp",
              options: {
                create: [
                  { position: 0, label: "Dagger", items: { create: [{ position: 0, catalogName: "Dagger" }] } },
                  { position: 1, label: "10 gp", gold: 10 },
                ],
              },
            },
          ],
        },
      },
    });
    COOKIE = await authCookie(OWNER_ID);
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: { in: createdCharacterIds } } });
    await prisma.characterClass.deleteMany({ where: { name: FIXTURE_CLASS.name } });
  });

  it("mode: gold 400s with a clear message instead of computing a range from null dice", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send({
        name: "Fixture Null Gold Character",
        alignment: "True Neutral",
        speciesId: human2014Id,
        background: "Soldier",
        classes: [{ name: FIXTURE_CLASS.name }],
        abilityScores: {
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        skillProficiencies: [] as string[],
        rulesEdition: "EDITION_2014",
        startingEquipment: { mode: "gold", gold: 25 },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/no roll-for-gold|no gold dice|gold/i);
    if (response.status === 201) createdCharacterIds.push(response.body.id);
  });

  it("mode: package still works for the same class (per-option gold, commit 2)", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send({
        name: "Fixture Null Gold Character (package)",
        alignment: "True Neutral",
        speciesId: human2014Id,
        background: "Soldier",
        classes: [{ name: FIXTURE_CLASS.name }],
        abilityScores: {
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        skillProficiencies: [] as string[],
        rulesEdition: "EDITION_2014",
        startingEquipment: { mode: "package", selections: [{ optionIndex: 1 }] },
      });

    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);
    expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 10, pp: 0 });
  });
});
