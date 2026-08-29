// StartingEquipmentOption.gold reaches the created character's currency (#1564) — a fixture class exercises this since real seeded EDITION_2014 packages all carry gold: 0 and can't.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesId } from "@/test-support/species.js";

const OWNER_ID = "owner-starting-equipment-gold";
let COOKIE: string;

const FIXTURE_CLASS = {
  name: "Zzz Fixture Gold Class (#1564)",
  hitDie: "d8",
  savingThrows: ["dexterity"],
  skillChoiceCount: 0,
  skillChoices: [] as string[],
  isSpellcaster: false,
};

let fixtureClassId: string;
let human2014Id: string;
const createdCharacterIds: string[] = [];

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Fixture Gold Character",
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
    rulesEdition: "EDITION_2014" as const,
    ...overrides,
  };
}

describe("per-option gold reaches the created character's currency (#1564)", () => {
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
        goldDiceCount: 1,
        goldDiceFaces: 4,
        goldMultiplier: 1,
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
            {
              position: 1,
              label: "(a) a handaxe or (b) 5 gp",
              options: {
                create: [
                  { position: 0, label: "Handaxe", items: { create: [{ position: 0, catalogName: "Handaxe" }] } },
                  { position: 1, label: "5 gp", gold: 5 },
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
    // Cascades to the package's groups/options/items.
    await prisma.characterClass.deleteMany({ where: { name: FIXTURE_CLASS.name } });
  });

  it("selecting both gold options sums their GP into startingCurrency", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send({
        ...baseBody(),
        startingEquipment: { mode: "package", selections: [{ optionIndex: 1 }, { optionIndex: 1 }] },
      });

    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);
    expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 15, pp: 0 });
  });

  it("selecting only item options (0 gold each) leaves currency at exactly zero", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send({
        ...baseBody(),
        startingEquipment: { mode: "package", selections: [{ optionIndex: 0 }, { optionIndex: 0 }] },
      });

    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);
    expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 0, pp: 0 });
  });

  it("mixing one gold option and one item option sums only the gold option's GP", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send({
        ...baseBody(),
        startingEquipment: { mode: "package", selections: [{ optionIndex: 0 }, { optionIndex: 1 }] },
      });

    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);
    expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 5, pp: 0 });
  });
});
