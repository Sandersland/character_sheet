/**
 * PHB'24 p.92: Magic action, expend 1 Focus, heal a creature you touch for
 * one Martial Arts die + Wisdom modifier.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-actions-hand-of-healing";
let COOKIE: string;

const MONK_ID = "test-actions-hand-of-healing";
const MONK_CATALOG_NAME = "Actions Hand Of Healing Test Monk";
let monkClassId: string;

const L3_XP = 900; // single-class monk level 3

const MONK_BASE = {
  id: MONK_ID,
  name: "Actions Hand Of Healing Test",
  alignment: "Neutral Good",
  initiativeBonus: 2,
  speed: 30,
  hitPoints: { current: 10, max: 24, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 3, die: "d8", spent: 0 },
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

async function seedHandOfHealingRows(classId: string): Promise<string> {
  await prisma.classFeature.deleteMany({ where: { classId, subclassId: null } });
  await prisma.classFeature.create({
    data: {
      classId, subclassId: null, name: "Focus", level: 2, edition: "EDITION_2024",
      description: "You have a pool of Focus Points equal to your monk level.",
      resourceKey: "focus", resourceLabel: "Focus Points", resourceRecharge: "short-or-long",
      resourceTotals: [{ minLevel: 2, total: { levelTimes: 1 } }],
    },
  });
  const existing = await prisma.subclass.findFirst({ where: { classId, slug: "actions-hand-of-healing-route-test" } });
  const sub =
    existing ??
    (await prisma.subclass.create({
      data: { classId, name: "Warrior of Mercy Route Test", description: "Test fixture subclass.", slug: "actions-hand-of-healing-route-test" },
    }));
  await prisma.classFeature.deleteMany({ where: { subclassId: sub.id } });
  await prisma.classFeature.createMany({
    data: [
      {
        classId, subclassId: sub.id, name: "Hand of Healing", level: 3, edition: "EDITION_2024",
        description: "Magic action, expend 1 focus to touch a creature and restore hit points.",
        resourceKey: "handOfHealing", activationCost: "action", costKind: "pool", costPoolKey: "focus", costBase: 1,
      },
      {
        classId, subclassId: sub.id, name: "Hand of Healing (Flurry replacement)", level: 3, edition: "EDITION_2024",
        description: "Replace one Unarmed Strike from Flurry of Blows with Hand of Healing at no extra Focus cost.",
        resourceKey: "handOfHealingFlurry", activationCost: "bonusAction", actionOnly: true,
      },
    ],
  });
  return sub.id;
}

async function createMonk() {
  const subclassId = await seedHandOfHealingRows(monkClassId);
  await prisma.character.create({
    data: {
      ...MONK_BASE,
      experiencePoints: L3_XP,
      ownerId: OWNER_ID,
      classEntries: {
        create: [{ name: "monk", classId: monkClassId, subclassId, position: 0, level: 3, subclass: "Warrior of Mercy" }],
      },
    },
  });
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

describe("POST /:id/actions/transactions — Hand of Healing (#1248)", () => {
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

  it("handOfHealing spends 1 focus and heals the client-rolled amount (Martial Arts die + Wis mod)", async () => {
    const res = await executeAction("handOfHealing", 6); // e.g. 1d6 rolled 4 + Wis +2
    expect(res.status).toBe(200);
    expect(pool(res.body, "focus")).toMatchObject({ used: 1, remaining: 2 }); // level 3 → 3 total
    expect(res.body.hitPoints.current).toBe(16); // 10 + 6
  });

  it("handOfHealing without a roll: spends focus but heals nothing", async () => {
    const res = await executeAction("handOfHealing");
    expect(res.status).toBe(200);
    expect(pool(res.body, "focus")).toMatchObject({ used: 1, remaining: 2 });
    expect(res.body.hitPoints.current).toBe(10); // unchanged
  });

  it("handOfHealing rejects a fourth use with no focus remaining (3 total at level 3)", async () => {
    await executeAction("handOfHealing", 1);
    await executeAction("handOfHealing", 1);
    await executeAction("handOfHealing", 1);
    const fourth = await executeAction("handOfHealing", 1);
    expect(fourth.status).toBe(400);
  });

  it("handOfHealingFlurry heals the client-rolled amount without spending focus", async () => {
    const res = await executeAction("handOfHealingFlurry", 6);
    expect(res.status).toBe(200);
    expect(pool(res.body, "focus")).toMatchObject({ used: 0, remaining: 3 });
    expect(res.body.hitPoints.current).toBe(16); // 10 + 6
  });

  it("handOfHealingFlurry without a roll: heals nothing and spends nothing", async () => {
    const res = await executeAction("handOfHealingFlurry");
    expect(res.status).toBe(200);
    expect(pool(res.body, "focus")).toMatchObject({ used: 0, remaining: 3 });
    expect(res.body.hitPoints.current).toBe(10); // unchanged
  });
});
