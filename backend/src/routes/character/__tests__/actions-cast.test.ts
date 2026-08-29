import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { fighterResourceRowsData } from "@/test-support/fighter-resource-rows.js";

const OWNER_ID = "owner-actions-cast";
let COOKIE: string;

const FIGHTER_ID = "test-actions-cast-fighter";
const FIGHTER_CATALOG_NAME = "Actions Cast Test Fighter";

const FIGHTER_BASE = {
  id: FIGHTER_ID,
  name: "Actions Cast Test Fighter",
  alignment: "Lawful Neutral",
  rulesEdition: "EDITION_2014" as const,
  experiencePoints: 6500,
  initiativeBonus: 2,
  speed: 30,
  hitPoints: { current: 20, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 5, die: "d10", spent: 0 },
  abilityScores: {
    strength: 16,
    dexterity: 14,
    constitution: 14,
    intelligence: 10,
    wisdom: 12,
    charisma: 8,
  },
  savingThrowProficiencies: ["strength", "constitution"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 10, pp: 0 },
};

interface ActivityEvent {
  batchId?: string;
  type: string;
}

async function activity(): Promise<ActivityEvent[]> {
  const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIGHTER_ID}/activity`);
  expect(res.status).toBe(200);
  return res.body as ActivityEvent[];
}

async function latestBatchId(): Promise<string> {
  const events = await activity();
  const batchId = events.find((e) => e.type !== "revert" && e.batchId)?.batchId;
  expect(batchId).toBeDefined();
  return batchId!;
}

function execute(actionKey: string) {
  return supertest
    .agent(app)
    .set("Cookie", COOKIE)
    .post(`/api/characters/${FIGHTER_ID}/actions/transactions`)
    .send({ operations: [{ type: "executeAction", actionKey }] });
}

function pool(body: { resources: { pools: Array<{ key: string; used: number; remaining: number }> } }, key: string) {
  return body.resources.pools.find((p) => p.key === key)!;
}

describe("POST /:id/actions/transactions — Second Wind, row-driven (#420, #1528)", () => {
  let fighterClassId: string;

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: FIGHTER_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: FIGHTER_CATALOG_NAME },
      create: {
        name: FIGHTER_CATALOG_NAME,
        hitDie: "d10",
        savingThrows: ["strength", "constitution"],
        skillChoiceCount: 2,
        skillChoices: ["athletics", "intimidation"],
        isSpellcaster: false,
        subclassLevel: 3,
      },
      update: {},
    });
    fighterClassId = cls.id;
    await prisma.classFeature.deleteMany({ where: { classId: fighterClassId } });
    await prisma.classFeature.createMany({ data: fighterResourceRowsData(fighterClassId) });

    await prisma.character.create({
      data: {
        ...FIGHTER_BASE,
        ownerId: OWNER_ID,
        classEntries: { create: [{ name: "fighter", classId: fighterClassId, position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIGHTER_ID } });
  });

  it("spends the pool and applies the server-rolled heal atomically, reporting the roll in `results`", async () => {
    const res = await execute("secondWind");
    expect(res.status).toBe(200);
    const roll = res.body.results[0].roll as number;

    expect(roll).toBeGreaterThanOrEqual(6);
    expect(roll).toBeLessThanOrEqual(15);
    expect(res.body.hitPoints.current).toBe(20 + roll);
    expect(pool(res.body, "secondWind")).toMatchObject({ used: 1, remaining: 0 });
  });

  it("response body carries the written batchId (matches the activity batch) — #758", async () => {
    const res = await execute("secondWind");
    expect(res.status).toBe(200);
    expect(typeof res.body.batchId).toBe("string");
    expect(res.body.batchId).toBe(await latestBatchId());
  });

  it("logs exactly a spendResource + heal event, and no cast event (history unchanged)", async () => {
    await execute("secondWind");
    const batchId = await latestBatchId();
    const inBatch = (await activity()).filter((e) => e.batchId === batchId);
    const types = inBatch.map((e) => e.type).sort();
    expect(types).toEqual(["heal", "spendResource"]);
    expect(types).not.toContain("castSpell");
    expect(types).not.toContain("castManeuver");
  });

  it("LIFO revert restores BOTH the pool and the HP together", async () => {
    const cast = await execute("secondWind");
    const roll = cast.body.results[0].roll as number;
    const batchId = await latestBatchId();
    const revert = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post(`/api/characters/${FIGHTER_ID}/events/${batchId}/revert`);
    expect(revert.status).toBe(200);
    expect(revert.body.hitPoints.current).toBe(20);
    void roll;
    expect(pool(revert.body, "secondWind")).toMatchObject({ used: 0, remaining: 1 });
  });

  it("second Second Wind fails with 400 once the pool is exhausted (whole batch rolls back)", async () => {
    await execute("secondWind");
    const res = await execute("secondWind");
    expect(res.status).toBe(400);
  });

  it("Action Surge stays a pure counter — spends actionSurge, no heal, no roll reported", async () => {
    const res = await execute("actionSurge");
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(20);
    expect(pool(res.body, "actionSurge").used).toBe(1);
    expect(res.body.results[0]).toEqual({});

    const batchId = await latestBatchId();
    const types = (await activity()).filter((e) => e.batchId === batchId).map((e) => e.type);
    expect(types).toEqual(["spendResource"]);
  });

  it("unknown action key → 400", async () => {
    const res = await execute("notAnAction");
    expect(res.status).toBe(400);
  });
});

// Second Wind is `1d10 + your Fighter level` (SRD 5.1 p. 23 / SRD 5.2 p. 48).
const MC_ID = "test-actions-cast-mc-fighter";
const MC_FIGHTER_CATALOG_NAME = "Actions Cast MC Test Fighter";
const MC_WIZARD_CATALOG_NAME = "Actions Cast MC Test Wizard";

describe("POST /:id/actions/transactions — Second Wind on a MULTICLASS Fighter (#1557 review)", () => {
  afterAll(async () => {
    await prisma.characterClass.deleteMany({
      where: { name: { in: [MC_FIGHTER_CATALOG_NAME, MC_WIZARD_CATALOG_NAME] } },
    });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const fighter = await prisma.characterClass.upsert({
      where: { name: MC_FIGHTER_CATALOG_NAME },
      create: {
        name: MC_FIGHTER_CATALOG_NAME,
        hitDie: "d10",
        savingThrows: ["strength", "constitution"],
        skillChoiceCount: 2,
        skillChoices: ["athletics", "intimidation"],
        isSpellcaster: false,
        subclassLevel: 3,
      },
      update: {},
    });
    const wizard = await prisma.characterClass.upsert({
      where: { name: MC_WIZARD_CATALOG_NAME },
      create: {
        name: MC_WIZARD_CATALOG_NAME,
        hitDie: "d6",
        savingThrows: ["intelligence", "wisdom"],
        skillChoiceCount: 2,
        skillChoices: ["arcana", "history"],
        isSpellcaster: false,
        subclassLevel: 2,
      },
      update: {},
    });
    await prisma.classFeature.deleteMany({ where: { classId: fighter.id } });
    await prisma.classFeature.createMany({ data: fighterResourceRowsData(fighter.id) });

    await prisma.character.create({
      data: {
        ...FIGHTER_BASE,
        id: MC_ID,
        name: "Actions Cast MC Test Fighter",
        ownerId: OWNER_ID,
        experiencePoints: 355000,
        hitPoints: { current: 20, max: 140, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 20, die: "d10", spent: 0 },
        classEntries: {
          create: [
            { name: "fighter", classId: fighter.id, position: 0, level: 1 },
            { name: "wizard", classId: wizard.id, position: 1, level: 19 },
          ],
        },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: MC_ID } });
  });

  it("heals 1d10 + FIGHTER level, not 1d10 + total character level", async () => {
    const res = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post(`/api/characters/${MC_ID}/actions/transactions`)
      .send({ operations: [{ type: "executeAction", actionKey: "secondWind" }] });
    expect(res.status).toBe(200);

    const roll = res.body.results[0].roll as number;
    expect(roll).toBeGreaterThanOrEqual(2);
    expect(roll).toBeLessThanOrEqual(11);
    expect(res.body.hitPoints.current).toBe(20 + roll);
  });
});
