/**
 * The shared ability endpoint (#1275): POST /api/characters/:id/abilities/:abilityKey/transactions.
 * Covers the dispatch contract (unknown key, auth, missing character) plus a
 * registry-driven table, so an ability added to ABILITY_REGISTRY is gated here
 * automatically instead of via a hand-maintained list of URLs.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { ABILITY_REGISTRY } from "@/lib/classes/ability-registry.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-abilities";
const OTHER_OWNER_ID = "owner-abilities-other";
const FIXTURE_ID = "test-abilities-rogue-1";
const OTHER_ID = "test-abilities-other-1";
const MISSING_ID = "test-abilities-nonexistent";
const CLASS_NAME = "Abilities Route Test Rogue";

let COOKIE: string;

const FIXTURE_BASE = {
  name: "Abilities Test Rogue",
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
  return supertest.agent(app).set("Cookie", COOKIE);
}
const abilityUrl = (characterId: string, key: string) =>
  `/api/characters/${characterId}/abilities/${key}/transactions`;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  await ensureTestOwner(OTHER_OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  const cls = await prisma.characterClass.upsert({
    where: { name: CLASS_NAME },
    create: { name: CLASS_NAME, hitDie: "d8", savingThrows: ["dexterity", "intelligence"], skillChoiceCount: 4, skillChoices: ["stealth"], isSpellcaster: false },
    update: {},
  });
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE, id: FIXTURE_ID, ownerId: OWNER_ID, resources: Prisma.JsonNull,
      classEntries: { create: [{ name: "rogue", classId: cls.id, position: 0, level: 7 }] },
    },
  });
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE, id: OTHER_ID, ownerId: OTHER_OWNER_ID, resources: Prisma.JsonNull,
      classEntries: { create: [{ name: "rogue", classId: cls.id, position: 0, level: 7 }] },
    },
  });
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: { in: [FIXTURE_ID, OTHER_ID] } } });
  await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  await prisma.user.deleteMany({ where: { id: { in: [OWNER_ID, OTHER_OWNER_ID] } } });
});

describe("POST /api/characters/:id/abilities/:abilityKey/transactions", () => {
  it("404s an unknown ability key", async () => {
    const res = await agent()
      .post(abilityUrl(FIXTURE_ID, "not-a-real-ability"))
      .send({ operations: [] });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Unknown ability" });
  });

  // Key resolution deliberately precedes assertCharacterAccess, so an unknown key
  // on someone else's sheet is 404 not 403 — matching what an unknown URL already
  // did via the /api catch-all. Ability keys are not secret.
  it("404s an unknown ability key even on a character the caller can't edit", async () => {
    const res = await agent().post(abilityUrl(OTHER_ID, "not-a-real-ability")).send({ operations: [] });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Unknown ability" });
  });

  it("401s without a session (the endpoint sits behind the /api requireAuth gate)", async () => {
    const res = await supertest(app)
      .post(abilityUrl(FIXTURE_ID, "sneak-attack"))
      .send({ operations: [] });
    expect(res.status).toBe(401);
  });

  it("rolls Sneak Attack end to end on the shared URL", async () => {
    const res = await agent()
      .post(abilityUrl(FIXTURE_ID, "sneak-attack"))
      .send({ operations: [{ type: "rollSneakAttack", eligible: true, usedThisTurn: false }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.dice).toBe(4);
    expect(result.faces).toBe(6);
    expect(res.body.character.id).toBe(FIXTURE_ID);
  });
});

// Registry-driven so a newly registered ability inherits the whole gate matrix
// instead of needing a row added to a list someone has to remember (#1275).
describe.each(Object.keys(ABILITY_REGISTRY))("ability %s", (key) => {
  it("404s a missing character", async () => {
    const res = await agent().post(abilityUrl(MISSING_ID, key)).send({ operations: [] });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Character not found");
  });

  it("403s a character the caller doesn't own", async () => {
    const res = await agent().post(abilityUrl(OTHER_ID, key)).send({ operations: [] });
    expect(res.status).toBe(403);
  });

  it("400s an empty operations batch on an owned character", async () => {
    const res = await agent().post(abilityUrl(FIXTURE_ID, key)).send({ operations: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request body");
    expect(res.body.details).toBeDefined();
  });
});
