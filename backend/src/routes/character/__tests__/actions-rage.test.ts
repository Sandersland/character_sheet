import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-actions-rage";
let COOKIE: string;

const BARB_ID = "test-actions-rage-barbarian";
let barbClassId: string;

// The rage pool derives from the XP-derived level; the melee-damage bonus derives from the persisted classEntry level — fixtures set both together.
const L1 = { xp: 0, level: 1 };
const L9 = { xp: 48000, level: 9 };
const L16 = { xp: 195000, level: 16 };

const BARB_BASE = {
  id: BARB_ID,
  name: "Actions Rage Test Barbarian",
  alignment: "Chaotic Neutral",
  initiativeBonus: 2,
  speed: 40,
  hitPoints: { current: 40, max: 40, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 1, die: "d12", spent: 0 },
  abilityScores: {
    strength: 16,
    dexterity: 14,
    constitution: 14,
    intelligence: 8,
    wisdom: 10,
    charisma: 8,
  },
  savingThrowProficiencies: ["strength", "constitution"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

interface ActivityEvent {
  batchId?: string;
  type: string;
}

async function createBarbarian({ xp, level }: { xp: number; level: number }) {
  await prisma.character.create({
    data: {
      ...BARB_BASE,
      experiencePoints: xp,
      ownerId: OWNER_ID,
      classEntries: { create: [{ name: "barbarian", classId: barbClassId, position: 0, level }] },
    },
  });
}

async function activity(): Promise<ActivityEvent[]> {
  const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${BARB_ID}/activity`);
  expect(res.status).toBe(200);
  return res.body as ActivityEvent[];
}

async function latestBatchId(): Promise<string> {
  const events = await activity();
  const batchId = events.find((e) => e.type !== "revert" && e.batchId)?.batchId;
  expect(batchId).toBeDefined();
  return batchId!;
}

function executeAction(actionKey: string) {
  return supertest
    .agent(app)
    .set("Cookie", COOKIE)
    .post(`/api/characters/${BARB_ID}/actions/transactions`)
    .send({ operations: [{ type: "executeAction", actionKey }] });
}

function damage(amount: number, damageType: string) {
  return supertest
    .agent(app)
    .set("Cookie", COOKIE)
    .post(`/api/characters/${BARB_ID}/hp`)
    .send({ operations: [{ type: "damage", amount, damageType }] });
}

interface SerializedBuff {
  key: string;
  target: string;
  modifier: number;
  resistDamageTypes?: string[];
}

function ragebuff(body: { activeEffects: { buffs: SerializedBuff[] } }): SerializedBuff | undefined {
  return body.activeEffects.buffs.find((b) => b.key === "rage");
}

function pool(body: { resources: { pools: Array<{ key: string; used: number; remaining: number }> } }, key: string) {
  return body.resources.pools.find((p) => p.key === key)!;
}

describe("POST /:id/actions/transactions — Rage (#458)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    barbClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Barbarian" } })).id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: BARB_ID } });
  });

  it("activating Rage applies a +2 meleeDamage buff with b/p/s resistance and spends one rage use (level 1)", async () => {
    await createBarbarian(L1);
    const res = await executeAction("rage");
    expect(res.status).toBe(200);

    const buff = ragebuff(res.body);
    expect(buff).toBeDefined();
    expect(buff!.target).toBe("meleeDamage");
    expect(buff!.modifier).toBe(2);
    expect(buff!.resistDamageTypes).toEqual(["bludgeoning", "piercing", "slashing"]);

    expect(pool(res.body, "rage")).toMatchObject({ used: 1, remaining: 1 });
  });

  it("the activation batch logs exactly a spendResource + buffApplied pair under one batchId", async () => {
    await createBarbarian(L1);
    await executeAction("rage");
    const events = await activity();
    const batchId = events.find((e) => e.type !== "revert" && e.batchId)?.batchId;
    expect(batchId).toBeDefined();
    const types = events.filter((e) => e.batchId === batchId).map((e) => e.type).sort();
    expect(types).toEqual(["buffApplied", "spendResource"]);
  });

  it.each([
    [L9, 3],
    [L16, 4],
  ])("derives the melee-damage bonus server-side from level (level %o → +%i)", async (fixture, expectedBonus) => {
    await createBarbarian(fixture);
    const res = await executeAction("rage");
    expect(res.status).toBe(200);
    expect(ragebuff(res.body)!.modifier).toBe(expectedBonus);
  });

  it("halves matching (bludgeoning) damage while raging (#456 through the real route)", async () => {
    await createBarbarian(L1);
    await executeAction("rage");
    const res = await damage(12, "bludgeoning");
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(34);
  });

  it("does NOT halve non-matching (fire) damage while raging — resistance is b/p/s only", async () => {
    await createBarbarian(L1);
    await executeAction("rage");
    const res = await damage(12, "fire");
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(28);
  });

  it("endRage clears the buff and resistance, and does NOT refund the rage use", async () => {
    await createBarbarian(L1);
    await executeAction("rage");

    const ended = await executeAction("endRage");
    expect(ended.status).toBe(200);
    expect(ragebuff(ended.body)).toBeUndefined();
    // Early end does not refund the rage use — endRage's op list is clearBuff only.
    expect(pool(ended.body, "rage")).toMatchObject({ used: 1, remaining: 1 });

    const res = await damage(12, "bludgeoning");
    expect(res.body.hitPoints.current).toBe(28);
  });

  it("LIFO revert of the activation restores the pool and removes the buff together", async () => {
    await createBarbarian(L1);
    await executeAction("rage");
    const batchId = await latestBatchId();

    const revert = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post(`/api/characters/${BARB_ID}/events/${batchId}/revert`);
    expect(revert.status).toBe(200);
    expect(ragebuff(revert.body)).toBeUndefined();
    expect(pool(revert.body, "rage")).toMatchObject({ used: 0, remaining: 2 });
  });
});
