/**
 * castManeuver route tests (#418). Level-3 Battle Master (Str 16, Cha 14) so the
 * superiority pool (4×d8), maneuver save DC (13), and Rally temp HP are
 * deterministic bounds. Covers: catalog spend + save DC on the event, Rally
 * self temp HP via the core path, custom (description-only) spend, die refunded
 * when the pool is empty, and the not-known error path.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-maneuvers";
let COOKIE: string;
const FIXTURE_ID = "test-maneuvers-character-1";
const CLASS_NAME = "Maneuvers Route Test Fighter";

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Maneuvers Test Battle Master",
  alignment: "Lawful Neutral",
  experiencePoints: 900, // level 3, prof +2
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 28, max: 28, temp: 0 },
  hitDice: { total: 3, die: "d10" },
  abilityScores: { strength: 16, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 10, charisma: 14 },
  savingThrowProficiencies: ["strength", "constitution"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

function agent() {
  return supertest.agent(createApp()).set("Cookie", COOKIE);
}
const resourcesUrl = `/api/characters/${FIXTURE_ID}/resources/transactions`;
const maneuversUrl = `/api/characters/${FIXTURE_ID}/maneuvers/transactions`;

async function learn(op: unknown): Promise<{ id: string; name: string; maneuverId?: string }> {
  const res = await agent().post(resourcesUrl).send({ operations: [op] });
  const list = res.body.resources.maneuversKnown as Array<{ id: string; name: string; maneuverId?: string }>;
  return list[list.length - 1];
}

describe("POST /api/characters/:id/maneuvers/transactions", () => {
  let tripId: string;
  let rallyId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: CLASS_NAME },
      create: { name: CLASS_NAME, hitDie: "d10", savingThrows: ["strength", "constitution"], skillChoiceCount: 2, skillChoices: ["athletics"], isSpellcaster: false },
      update: {},
    });
    tripId = (await prisma.grantedAbility.findUnique({ where: { name: "Trip Attack" } }))!.id;
    rallyId = (await prisma.grantedAbility.findUnique({ where: { name: "Rally" } }))!.id;
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        ownerId: OWNER_ID,
        resources: Prisma.JsonNull,
        classEntries: { create: [{ name: "fighter", subclass: "battle master", classId: cls.id, position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  it("spends a die and announces the save DC on a catalog maneuver", async () => {
    const entry = await learn({ type: "learnManeuver", maneuverId: tripId });
    expect(entry.maneuverId).toBe(tripId);

    const res = await agent().post(maneuversUrl).send({ operations: [{ type: "castManeuver", entryId: entry.id }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.roll).toBeGreaterThanOrEqual(1);
    expect(result.roll).toBeLessThanOrEqual(8);
    expect(result.saveDc).toBe(13);
    expect(result.summary).toBe(`Used Trip Attack — d8:${result.roll}, DC 13 Str save`);

    const pool = res.body.character.resources.pools.find((p: { key: string }) => p.key === "superiorityDice");
    expect(pool.remaining).toBe(3);
  });

  it("Rally applies self temp HP (die + Cha mod) via the core self-apply path", async () => {
    const entry = await learn({ type: "learnManeuver", maneuverId: rallyId });
    const res = await agent().post(maneuversUrl).send({ operations: [{ type: "castManeuver", entryId: entry.id }] });
    const { roll } = res.body.results[0];
    expect(res.body.character.hitPoints.temp).toBe(roll + 2); // Cha 14 → +2
    expect(res.body.results[0].saveDc).toBeNull();
    expect(res.body.results[0].summary).toContain("temp HP");
  });

  it("a custom (description-only) maneuver is still spendable with no save DC", async () => {
    const entry = await learn({ type: "learnManeuver", custom: { name: "Homebrew Flourish", description: "d" } });
    expect(entry.maneuverId).toBeUndefined();
    const res = await agent().post(maneuversUrl).send({ operations: [{ type: "castManeuver", entryId: entry.id }] });
    expect(res.status).toBe(200);
    expect(res.body.results[0].saveDc).toBeNull();
    expect(res.body.character.resources.pools.find((p: { key: string }) => p.key === "superiorityDice").remaining).toBe(3);
  });

  it("400s casting a maneuver the character does not know", async () => {
    const res = await agent().post(maneuversUrl).send({ operations: [{ type: "castManeuver", entryId: "nope" }] });
    expect(res.status).toBe(400);
  });

  it("400s (die refunded) when no superiority dice remain", async () => {
    const entry = await learn({ type: "learnManeuver", maneuverId: tripId });
    // Drain all 4 dice.
    await agent().post(resourcesUrl).send({ operations: [{ type: "spendResource", key: "superiorityDice", amount: 4 }] });
    const res = await agent().post(maneuversUrl).send({ operations: [{ type: "castManeuver", entryId: entry.id }] });
    expect(res.status).toBe(400);
    const check = await agent().get(`/api/characters/${FIXTURE_ID}`);
    expect(check.body.resources.pools.find((p: { key: string }) => p.key === "superiorityDice").remaining).toBe(0);
  });
});
