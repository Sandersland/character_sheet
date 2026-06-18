import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";

const FIXTURE = {
  id: "test-character-1",
  name: "Test Fixture",
  race: "Human",
  class: "Fighter",
  subclass: null,
  background: "Soldier",
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
  inventory: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  spellcasting: null,
  journal: [],
};

describe("characters routes", () => {
  beforeEach(async () => {
    await prisma.character.create({ data: FIXTURE });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE.id } });
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

  it("PATCH 404s for unknown id", async () => {
    const response = await supertest(createApp())
      .patch("/api/characters/does-not-exist")
      .send({ experiencePoints: 100 });

    expect(response.status).toBe(404);
  });
});
