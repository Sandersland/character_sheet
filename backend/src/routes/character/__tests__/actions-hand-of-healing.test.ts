/**
 * Hand of Healing route tests (#1248) — the Warrior of Mercy's Magic-action
 * heal exercised through the real HTTP stack (POST
 * /api/characters/:id/actions/transactions), mirroring
 * actions-wholeness-of-body.test.ts's pattern.
 *
 * PHB'24 p.92: Magic action, expend 1 Focus, heal a creature you touch for
 * one Martial Arts die + Wisdom modifier. The Flurry-replacement variant
 * (handOfHealingFlurry) heals the same client-rolled amount without spending
 * Focus — Flurry's own focus cost is already paid via the flurryOfBlows action.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const app = () => createApp();

const OWNER_ID = "owner-actions-hand-of-healing";
let COOKIE: string;

const MONK_ID = "test-actions-hand-of-healing";
const MONK_CATALOG_NAME = "Actions Hand Of Healing Test Monk";
let monkClassId: string;

// XP threshold for level 3 (single-class).
const L3_XP = 900;

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

async function createMonk() {
  await prisma.character.create({
    data: {
      ...MONK_BASE,
      experiencePoints: L3_XP,
      ownerId: OWNER_ID,
      classEntries: {
        create: [{ name: "monk", classId: monkClassId, position: 0, level: 3, subclass: "Warrior of Mercy" }],
      },
    },
  });
}

function executeAction(actionKey: string, roll?: number) {
  return supertest
    .agent(app())
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
