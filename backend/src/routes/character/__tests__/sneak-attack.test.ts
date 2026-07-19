/**
 * Sneak Attack route tests (#902). A level-7 rogue rolls 4d6 (deterministic
 * bounds 4–24) on a qualifying hit; the once-per-turn + eligibility guard
 * rejects a repeat, an ineligible assertion, and a non-rogue.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-sneak-attack";
let COOKIE: string;
const FIXTURE_ID = "test-sneak-attack-character-1";
const CLASS_NAME = "Sneak Attack Route Test Rogue";

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Sneak Attack Test Rogue",
  alignment: "Chaotic Neutral",
  experiencePoints: 23000, // level 7
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 44, max: 44, temp: 0 },
  hitDice: { total: 7, die: "d8" },
  abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: ["dexterity", "intelligence"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

function agent() {
  return supertest.agent(createApp()).set("Cookie", COOKIE);
}
const url = `/api/characters/${FIXTURE_ID}/sneak-attack/transactions`;

async function createRogue(level: number) {
  const cls = await prisma.characterClass.upsert({
    where: { name: CLASS_NAME },
    create: { name: CLASS_NAME, hitDie: "d8", savingThrows: ["dexterity", "intelligence"], skillChoiceCount: 4, skillChoices: ["stealth"], isSpellcaster: false },
    update: {},
  });
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      ownerId: OWNER_ID,
      resources: Prisma.JsonNull,
      classEntries: { create: [{ name: "rogue", classId: cls.id, position: 0, level }] },
    },
  });
}

describe("POST /api/characters/:id/sneak-attack/transactions", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createRogue(7);
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  it("rolls 4d6 for a level-7 rogue on a qualifying hit", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "rollSneakAttack", eligible: true, usedThisTurn: false }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.dice).toBe(4);
    expect(result.faces).toBe(6);
    expect(result.roll).toBeGreaterThanOrEqual(4);
    expect(result.roll).toBeLessThanOrEqual(24);
    expect(result.summary).toBe(`Sneak Attack — 4d6: ${result.roll}`);
  });

  it("the once-per-turn guard rejects a second application in the same turn", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "rollSneakAttack", eligible: true, usedThisTurn: true }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/once per turn/i);
  });

  it("rejects an ineligible application (no advantage / no adjacent ally)", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "rollSneakAttack", eligible: false, usedThisTurn: false }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/advantage|adjacent/i);
  });
});

describe("Sneak Attack for a non-rogue", () => {
  const FIGHTER_ID = "test-sneak-attack-fighter-1";
  const FIGHTER_CLASS = "Sneak Attack Non-Rogue Fighter";
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: FIGHTER_CLASS },
      create: { name: FIGHTER_CLASS, hitDie: "d10", savingThrows: ["strength", "constitution"], skillChoiceCount: 2, skillChoices: ["athletics"], isSpellcaster: false },
      update: {},
    });
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        id: FIGHTER_ID,
        ownerId: OWNER_ID,
        resources: Prisma.JsonNull,
        classEntries: { create: [{ name: "fighter", classId: cls.id, position: 0, level: 7 }] },
      },
    });
  });
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIGHTER_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: FIGHTER_CLASS } });
  });

  it("rejects a non-rogue with no Sneak Attack", async () => {
    const res = await agent()
      .post(`/api/characters/${FIGHTER_ID}/sneak-attack/transactions`)
      .send({ operations: [{ type: "rollSneakAttack", eligible: true, usedThisTurn: false }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rogue/i);
  });
});
