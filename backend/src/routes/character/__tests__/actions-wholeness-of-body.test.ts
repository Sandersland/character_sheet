// SRD 5.2

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-actions-wholeness-of-body";
let COOKIE: string;

const MONK_ID = "test-actions-wholeness-of-body";
const MONK_CATALOG_NAME = "Actions Wholeness Of Body Test Monk";
let monkClassId: string;

const L6_XP = 14000;

const MONK_BASE = {
  id: MONK_ID,
  name: "Actions Wholeness Of Body Test",
  alignment: "Lawful Neutral",
  initiativeBonus: 2,
  speed: 30,
  hitPoints: { current: 10, max: 40, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 6, die: "d8", spent: 0 },
  abilityScores: {
    strength: 12,
    dexterity: 16,
    constitution: 12,
    intelligence: 10,
    wisdom: 14,
    charisma: 8,
  },
  savingThrowProficiencies: ["strength", "dexterity"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

interface ActivityEvent {
  type: string;
  data?: Record<string, unknown>;
}

async function seedWholenessOfBodyRow(classId: string): Promise<string> {
  const existing = await prisma.subclass.findFirst({ where: { classId, slug: "actions-wholeness-of-body-route-test" } });
  const sub =
    existing ??
    (await prisma.subclass.create({
      data: { classId, name: "Warrior of the Open Hand Route Test", description: "Test fixture subclass.", slug: "actions-wholeness-of-body-route-test" },
    }));
  await prisma.classFeature.deleteMany({ where: { subclassId: sub.id } });
  await prisma.classFeature.create({
    data: {
      classId, subclassId: sub.id, name: "Wholeness of Body", level: 6, edition: "EDITION_2024",
      description: "row text",
      resourceKey: "wholenessOfBody", resourceRecharge: "longRest",
      resourceTotals: [{ minLevel: 6, total: { abilityMod: "wisdom", min: 1 } }],
      activationCost: "bonusAction", costKind: "pool", costPoolKey: "wholenessOfBody", costBase: 1,
    },
  });
  return sub.id;
}

async function createMonk() {
  const subclassId = await seedWholenessOfBodyRow(monkClassId);
  await prisma.character.create({
    data: {
      ...MONK_BASE,
      experiencePoints: L6_XP,
      ownerId: OWNER_ID,
      classEntries: {
        create: [{ name: "monk", classId: monkClassId, subclassId, position: 0, level: 6, subclass: "Warrior of the Open Hand" }],
      },
    },
  });
}

async function activity(): Promise<ActivityEvent[]> {
  const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${MONK_ID}/activity`);
  expect(res.status).toBe(200);
  return res.body as ActivityEvent[];
}

function executeAction(actionKey: string, roll?: number) {
  return supertest
    .agent(app)
    .set("Cookie", COOKIE)
    .post(`/api/characters/${MONK_ID}/actions/transactions`)
    .send({ operations: [{ type: "executeAction", actionKey, ...(roll !== undefined ? { roll } : {}) }] });
}

function pool(body: { resources: { pools: Array<{ key: string; used: number; remaining: number }> } }, key: string) {
  return body.resources.pools.find((p) => p.key === key)!;
}

describe("POST /:id/actions/transactions — Wholeness of Body (#1245)", () => {
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: MONK_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: MONK_CATALOG_NAME },
      create: {
        name: MONK_CATALOG_NAME,
        hitDie: "d8",
        savingThrows: ["strength", "dexterity"],
        skillChoiceCount: 2,
        skillChoices: ["acrobatics", "stealth"],
        isSpellcaster: false,
        subclassLevel: 3,
      },
      update: {},
    });
    monkClassId = cls.id;
    await createMonk();
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: MONK_ID } });
  });

  it("spends 1 use and heals the client-rolled amount (Martial Arts die + Wis mod)", async () => {
    const res = await executeAction("wholenessOfBody", 7);
    expect(res.status).toBe(200);
    expect(pool(res.body, "wholenessOfBody")).toMatchObject({ used: 1, remaining: 1 });
    expect(res.body.hitPoints.current).toBe(17);
  });

  it("the spend is logged as a session/activity spendResource event", async () => {
    await executeAction("wholenessOfBody", 7);
    const events = await activity();
    const spend = events.find((e) => e.type === "spendResource" && e.data?.key === "wholenessOfBody");
    expect(spend).toBeDefined();
    const heal = events.find((e) => e.type === "heal");
    expect(heal).toBeDefined();
  });

  it("a third use in the same long rest is rejected (only 2 uses at Wis +2)", async () => {
    await executeAction("wholenessOfBody", 5);
    await executeAction("wholenessOfBody", 5);
    const third = await executeAction("wholenessOfBody", 5);
    expect(third.status).toBe(400);
  });

  it("without a roll: spends the use but heals nothing", async () => {
    const res = await executeAction("wholenessOfBody");
    expect(res.status).toBe(200);
    expect(pool(res.body, "wholenessOfBody")).toMatchObject({ used: 1, remaining: 1 });
    expect(res.body.hitPoints.current).toBe(10);
  });
});
