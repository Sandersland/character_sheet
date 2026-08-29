// openPickFilterError hard-required catalogItem.category === "weapon"; widened for toolCategory (Bard's musical instrument) and boundToToolChoice (Monk's tool bound to an already-made proficiency choice) (#1564).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesId } from "@/test-support/species.js";

const OWNER_ID = "owner-starting-equipment-tool-picks";
let COOKIE: string;

const FIXTURE_CLASS = {
  name: "Zzz Fixture Tool Pick Class (#1564)",
  hitDie: "d8",
  savingThrows: ["dexterity"],
  skillChoiceCount: 0,
  skillChoices: [] as string[],
  isSpellcaster: false,
  // Monk-like: the player chooses ONE tool proficiency from this pool.
  toolChoices: ["Flute", "Drum"],
  toolChoiceCount: 1,
};

let fixtureClassId: string;
let human2014Id: string;
const createdCharacterIds: string[] = [];

// Every group has exactly one option so `optionIndex: 0` is always valid; each test varies only the open-pick choice under test.
function selections(weaponPick: string, instrumentPick: string, boundPick: string) {
  return {
    mode: "package" as const,
    selections: [
      { optionIndex: 0, openPicks: [weaponPick] },
      { optionIndex: 0, openPicks: [instrumentPick] },
      { optionIndex: 0, openPicks: [boundPick] },
    ],
  };
}

function baseBody(toolChoices: string[]) {
  return {
    name: "Fixture Tool Pick Character",
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
    toolChoices,
    rulesEdition: "EDITION_2014" as const,
  };
}

describe("open picks widen past weapons (#1564)", () => {
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
              label: "(existing behaviour) any simple weapon",
              options: {
                create: [
                  {
                    position: 0,
                    label: "Any simple weapon",
                    openPicks: { create: [{ position: 0, label: "any simple weapon", weaponClass: "simple" }] },
                  },
                ],
              },
            },
            {
              position: 1,
              label: "musical instrument of your choice",
              options: {
                create: [
                  {
                    position: 0,
                    label: "A musical instrument",
                    openPicks: { create: [{ position: 0, label: "musical instrument", toolCategory: "musicalInstrument" }] },
                  },
                ],
              },
            },
            {
              position: 2,
              label: "the tool chosen for the proficiency above",
              options: {
                create: [
                  {
                    position: 0,
                    label: "Tool bound to your proficiency choice",
                    openPicks: { create: [{ position: 0, label: "the tool chosen above", boundToToolChoice: true }] },
                  },
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

  it("(a) toolCategory pick accepts a Flute and rejects a Longsword", async () => {
    const ok = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send({ ...baseBody(["Flute"]), startingEquipment: selections("Dagger", "Flute", "Flute") });
    expect(ok.status).toBe(201);
    createdCharacterIds.push(ok.body.id);

    const rejected = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send({ ...baseBody(["Flute"]), startingEquipment: selections("Dagger", "Longsword", "Flute") });
    expect(rejected.status).toBe(400);
    if (rejected.status === 201) createdCharacterIds.push(rejected.body.id);
  });

  it("(b) boundToToolChoice pick accepts the character's chosen tool proficiency and rejects one they didn't choose", async () => {
    const ok = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send({ ...baseBody(["Flute"]), startingEquipment: selections("Dagger", "Flute", "Flute") });
    expect(ok.status).toBe(201);
    createdCharacterIds.push(ok.body.id);

    const rejected = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send({ ...baseBody(["Flute"]), startingEquipment: selections("Dagger", "Flute", "Drum") });
    expect(rejected.status).toBe(400);
    if (rejected.status === 201) createdCharacterIds.push(rejected.body.id);
  });

  it("(c) an existing weapon-filtered pick still rejects a non-weapon", async () => {
    const rejected = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send({ ...baseBody(["Flute"]), startingEquipment: selections("Flute", "Flute", "Flute") });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toMatch(/weapon/i);
    if (rejected.status === 201) createdCharacterIds.push(rejected.body.id);
  });
});
