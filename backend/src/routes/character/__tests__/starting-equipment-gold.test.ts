// Per-option GP reaching the created character's purse (#1564, commit 2).
// PHB'24 puts a GP amount on almost every option (StartingEquipmentOption.gold),
// and #1535 (parked, follow-up) will author twelve real packages carrying it —
// if creation silently ignored the column, every one of those packages' gold
// would vanish and every #1535 test would still pass. A fixture class (same
// "safe from assertEveryClassEditionHasPackage" reasoning as
// starting-equipment-edition.test.ts, which this file mirrors) proves the
// write path end to end, since the real seeded EDITION_2014 packages all
// carry gold: 0 by construction and can't exercise the accumulation at all.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";

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
const createdCharacterIds: string[] = [];

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Fixture Gold Character",
    alignment: "True Neutral",
    race: "Human",
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
    const cls = await prisma.characterClass.upsert({
      where: { name: FIXTURE_CLASS.name },
      create: FIXTURE_CLASS,
      update: FIXTURE_CLASS,
    });
    fixtureClassId = cls.id;

    // Two groups, each offering a fixed-item (0 gold) option and a flat-gold
    // option with no items — the PHB'24 shape ("(a) a dagger or (b) 10 gp").
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
    // Cascades to the package's groups/options/items (schema onDelete: Cascade).
    await prisma.characterClass.deleteMany({ where: { name: FIXTURE_CLASS.name } });
  });

  it("selecting both gold options sums their GP into startingCurrency", async () => {
    const response = await supertest
      .agent(createApp())
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
      .agent(createApp())
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
      .agent(createApp())
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
