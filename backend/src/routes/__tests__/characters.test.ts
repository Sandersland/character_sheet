import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";

const TEST_RACE = { name: "Test Race", speed: 30 };
const TEST_CLASS = {
  name: "Test Class",
  hitDie: "d10",
  savingThrows: ["strength"],
  skillChoiceCount: 2,
  skillChoices: ["athletics", "perception"],
  isSpellcaster: false,
};
const TEST_BACKGROUND = { name: "Test Background", skillProficiencies: ["athletics"] };
const TEST_ITEM = {
  name: "Test Club",
  category: "weapon" as const,
  weight: 2,
  cost: { cp: 0, sp: 1, gp: 0, pp: 0 },
  damageDice: "1d4",
  damageType: "bludgeoning",
  properties: ["light"],
};

const FIXTURE = {
  id: "test-character-1",
  name: "Test Fixture",
  alignment: "Lawful Good",
  portraitUrl: null,
  experiencePoints: 1000,
  armorClass: 16,
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d10" },
  abilityScores: {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  },
  savingThrowProficiencies: ["strength"],
  skills: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  journal: [],
};

describe("characters routes", () => {
  // Track every character created over the course of a test (the fixture
  // plus anything a POST test creates) so afterEach can clean all of them
  // up, even ids we don't know ahead of time.
  let createdCharacterIds: string[] = [];

  beforeEach(async () => {
    // Sequential rather than Promise.all — see the matching comment in
    // routes/characters.ts's POST handler.
    const race = await prisma.race.upsert({
      where: { name: TEST_RACE.name },
      create: TEST_RACE,
      update: TEST_RACE,
    });
    const characterClass = await prisma.characterClass.upsert({
      where: { name: TEST_CLASS.name },
      create: TEST_CLASS,
      update: TEST_CLASS,
    });
    const background = await prisma.background.upsert({
      where: { name: TEST_BACKGROUND.name },
      create: TEST_BACKGROUND,
      update: TEST_BACKGROUND,
    });
    const item = await prisma.item.upsert({
      where: { name: TEST_ITEM.name },
      create: TEST_ITEM,
      update: TEST_ITEM,
    });

    await prisma.character.create({
      data: {
        ...FIXTURE,
        spellcasting: Prisma.JsonNull,
        raceSelection: { create: { name: race.name, raceId: race.id } },
        backgroundSelection: { create: { name: background.name, backgroundId: background.id } },
        classEntries: {
          create: [{ name: characterClass.name, classId: characterClass.id, position: 0 }],
        },
        inventoryItems: {
          create: [
            {
              itemId: item.id,
              name: item.name,
              category: item.category,
              weight: item.weight,
              cost: TEST_ITEM.cost,
              damageDice: item.damageDice,
              damageType: item.damageType,
              properties: item.properties,
              quantity: 1,
              equipped: true,
              position: 0,
            },
            {
              itemId: null,
              name: "Homebrew Amulet",
              category: "gear",
              description: "A custom magic item with no catalog entry.",
              quantity: 1,
              position: 1,
            },
          ],
        },
      },
    });

    createdCharacterIds = [FIXTURE.id];
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: { in: createdCharacterIds } } });
  });

  // The catalog rows are upserted (not deleted) between tests so reruns
  // don't churn ids — but they shouldn't linger in a shared dev database
  // as selectable "Test Race"/"Test Class"/"Test Background"/"Test Club"
  // options once the whole suite is done.
  afterAll(async () => {
    await prisma.race.deleteMany({ where: { name: TEST_RACE.name } });
    await prisma.characterClass.deleteMany({ where: { name: TEST_CLASS.name } });
    await prisma.background.deleteMany({ where: { name: TEST_BACKGROUND.name } });
    await prisma.item.deleteMany({ where: { name: TEST_ITEM.name } });
  });

  it("GET /api/characters returns summaries with derived level", async () => {
    const response = await supertest(createApp()).get("/api/characters");

    expect(response.status).toBe(200);
    const fixture = response.body.find(
      (c: { id: string }) => c.id === FIXTURE.id
    );
    expect(fixture).toMatchObject({ name: "Test Fixture", level: 3 });
  });

  it("GET /api/characters/:id returns full character with derived fields", async () => {
    const response = await supertest(createApp()).get(
      `/api/characters/${FIXTURE.id}`
    );

    expect(response.status).toBe(200);
    expect(response.body.level).toBe(3);
    expect(response.body.proficiencyBonus).toBe(2);
    expect(response.body.currentLevelThreshold).toBe(900);
    expect(response.body.nextLevelThreshold).toBe(2700);
    expect(response.body.experiencePoints).toBe(1000);
    expect(response.body.race).toBe(TEST_RACE.name);
    expect(response.body.class).toBe(TEST_CLASS.name);
    expect(response.body.background).toBe(TEST_BACKGROUND.name);

    expect(response.body.inventory).toHaveLength(2);
    const [catalogRow, homebrewRow] = response.body.inventory;
    expect(catalogRow).toMatchObject({
      name: TEST_ITEM.name,
      category: "weapon",
      damageDice: "1d4",
      damageType: "bludgeoning",
      properties: ["light"],
      quantity: 1,
      equipped: true,
    });
    expect(typeof catalogRow.itemId).toBe("string");
    expect(homebrewRow).toMatchObject({
      name: "Homebrew Amulet",
      category: "gear",
      description: "A custom magic item with no catalog entry.",
      quantity: 1,
      equipped: false,
    });
    expect(homebrewRow.itemId).toBeUndefined();
  });

  it("GET /api/characters/:id 404s for unknown id", async () => {
    const response = await supertest(createApp()).get(
      "/api/characters/does-not-exist"
    );

    expect(response.status).toBe(404);
  });

  it("PATCH /api/characters/:id updates experiencePoints and recomputes level", async () => {
    const response = await supertest(createApp())
      .patch(`/api/characters/${FIXTURE.id}`)
      .send({ experiencePoints: 6500 });

    expect(response.status).toBe(200);
    expect(response.body.experiencePoints).toBe(6500);
    expect(response.body.level).toBe(5);
    expect(response.body.proficiencyBonus).toBe(3);
  });

  it("PATCH rejects attempts to set level directly", async () => {
    const response = await supertest(createApp())
      .patch(`/api/characters/${FIXTURE.id}`)
      .send({ level: 99 });

    expect(response.status).toBe(400);
  });

  it("PATCH rejects negative experiencePoints", async () => {
    const response = await supertest(createApp())
      .patch(`/api/characters/${FIXTURE.id}`)
      .send({ experiencePoints: -5 });

    expect(response.status).toBe(400);
  });

  it("PATCH rejects attempts to set race/class/background directly", async () => {
    const response = await supertest(createApp())
      .patch(`/api/characters/${FIXTURE.id}`)
      .send({ race: "Human" });

    expect(response.status).toBe(400);
  });

  it("PATCH 404s for unknown id", async () => {
    const response = await supertest(createApp())
      .patch("/api/characters/does-not-exist")
      .send({ experiencePoints: 100 });

    expect(response.status).toBe(404);
  });

  describe("POST /api/characters", () => {
    const createBody = {
      name: "New Hero",
      alignment: "Lawful Good",
      race: TEST_RACE.name,
      background: TEST_BACKGROUND.name,
      classes: [{ name: TEST_CLASS.name }],
      abilityScores: {
        strength: 15,
        dexterity: 12,
        constitution: 14,
        intelligence: 8,
        wisdom: 10,
        charisma: 8,
      },
      skillProficiencies: ["athletics", "perception"],
    };

    it("creates a character and derives mechanical fields from the catalog", async () => {
      const response = await supertest(createApp())
        .post("/api/characters")
        .send(createBody);

      expect(response.status).toBe(201);
      createdCharacterIds.push(response.body.id);

      expect(response.body).toMatchObject({
        name: "New Hero",
        race: TEST_RACE.name,
        class: TEST_CLASS.name,
        background: TEST_BACKGROUND.name,
        level: 1,
        proficiencyBonus: 2,
        experiencePoints: 0,
        speed: TEST_RACE.speed,
        hitDice: { total: 1, die: "d10" },
        // constitution 14 -> +2 modifier, d10 hit die -> 12 max HP
        hitPoints: { current: 12, max: 12, temp: 0 },
        // dexterity 12 -> +1 modifier
        armorClass: 11,
        initiativeBonus: 1,
        savingThrowProficiencies: ["strength"],
        inventory: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        journal: [],
      });
      expect(response.body.spellcasting).toBeUndefined();

      const athletics = response.body.skills.find((s: { name: string }) => s.name === "athletics");
      const perception = response.body.skills.find((s: { name: string }) => s.name === "perception");
      const stealth = response.body.skills.find((s: { name: string }) => s.name === "stealth");
      expect(athletics).toMatchObject({ proficient: true });
      expect(perception).toMatchObject({ proficient: true });
      expect(stealth).toMatchObject({ proficient: false });
      expect(response.body.skills).toHaveLength(18);
    });

    it("persists the race/background/class as cascade-deleted selection rows", async () => {
      const response = await supertest(createApp())
        .post("/api/characters")
        .send(createBody);

      expect(response.status).toBe(201);
      const id = response.body.id;
      createdCharacterIds.push(id);

      await expect(prisma.characterRace.findUnique({ where: { characterId: id } })).resolves.not.toBeNull();
      await expect(prisma.characterBackground.findUnique({ where: { characterId: id } })).resolves.not.toBeNull();
      await expect(prisma.characterClassEntry.findMany({ where: { characterId: id } })).resolves.toHaveLength(1);

      await prisma.character.delete({ where: { id } });

      await expect(prisma.characterRace.findUnique({ where: { characterId: id } })).resolves.toBeNull();
      await expect(prisma.characterBackground.findUnique({ where: { characterId: id } })).resolves.toBeNull();
      await expect(prisma.characterClassEntry.findMany({ where: { characterId: id } })).resolves.toHaveLength(0);

      createdCharacterIds = createdCharacterIds.filter((existingId) => existingId !== id);
    });

    it("allows a homebrew background with no catalog match", async () => {
      const response = await supertest(createApp())
        .post("/api/characters")
        .send({ ...createBody, background: "Wandering Storyteller" });

      expect(response.status).toBe(201);
      createdCharacterIds.push(response.body.id);
      expect(response.body.background).toBe("Wandering Storyteller");
    });

    it("rejects an unresolvable race with 400", async () => {
      const response = await supertest(createApp())
        .post("/api/characters")
        .send({ ...createBody, race: "Not A Real Race" });

      expect(response.status).toBe(400);
    });

    it("rejects an unresolvable class with 400", async () => {
      const response = await supertest(createApp())
        .post("/api/characters")
        .send({ ...createBody, classes: [{ name: "Not A Real Class" }] });

      expect(response.status).toBe(400);
    });

    it("rejects an unknown alignment with 400", async () => {
      const response = await supertest(createApp())
        .post("/api/characters")
        .send({ ...createBody, alignment: "Mostly Good" });

      expect(response.status).toBe(400);
    });

    it("rejects a missing required field with 400", async () => {
      const { name, ...withoutName } = createBody;
      void name;

      const response = await supertest(createApp())
        .post("/api/characters")
        .send(withoutName);

      expect(response.status).toBe(400);
    });

    it("rejects a derived/mechanical field via .strict() with 400", async () => {
      const response = await supertest(createApp())
        .post("/api/characters")
        .send({ ...createBody, armorClass: 99 });

      expect(response.status).toBe(400);
    });
  });
});
