/**
 * Rage route tests (#458) — the full package exercised through the real HTTP
 * stack (POST /api/characters/:id/actions/transactions), not the pure fns.
 *
 * These pin what the route's own level-lookup + orchestrator produce, which the
 * pure-function (actions.test.ts) and helper-level (active-effects-durable) tests
 * cannot reach:
 *   - the route queries classEntries and derives the +2/+3/+4 melee-damage bonus
 *     server-side (level 1 / 9 / 16), never trusting the client
 *   - activating Rage applies a while-active meleeDamage buff carrying the b/p/s
 *     resistDamageTypes and spends one rage use, atomically under one batchId with
 *     a spendResource + buffApplied event pair
 *   - b/p/s damage auto-halves while raging (integration with #456) through the
 *     real HP route, and un-halves once Rage ends
 *   - manual endRage clears the buff but does NOT refund the rage use (early end
 *     ≠ refund — endRage's op list is clearBuff only)
 *   - LIFO revert of the activation restores the pool AND removes the buff together
 *
 * Real Postgres in each test; supertest against createApp(). Uniquely-named class
 * fixture per testing.md so afterAll cleanup never touches seeded rows.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../../app.js";
import { prisma } from "../../../lib/prisma.js";
import { ensureTestOwner } from "../../../test-support/owner.js";
import { authCookie } from "../../../test-support/auth.js";

const app = () => createApp();

const OWNER_ID = "owner-actions-rage";
let COOKIE: string;

const BARB_ID = "test-actions-rage-barbarian";
const BARB_CATALOG_NAME = "Actions Rage Test Barbarian";
let barbClassId: string;

// XP thresholds: L1 = 0, L9 = 48000, L16 = 195000. The rage-count pool derives
// from the XP-driven serialized level; the route derives the melee-damage bonus
// from the persisted per-class entry level — a real single-class barbarian keeps
// both in lockstep, so each fixture sets XP and classEntry level together.
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
  const res = await supertest.agent(app()).set("Cookie", COOKIE).get(`/api/characters/${BARB_ID}/activity`);
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
    .agent(app())
    .set("Cookie", COOKIE)
    .post(`/api/characters/${BARB_ID}/actions/transactions`)
    .send({ operations: [{ type: "executeAction", actionKey }] });
}

function damage(amount: number, damageType: string) {
  return supertest
    .agent(app())
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
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: BARB_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: BARB_CATALOG_NAME },
      create: {
        name: BARB_CATALOG_NAME,
        hitDie: "d12",
        savingThrows: ["strength", "constitution"],
        skillChoiceCount: 2,
        skillChoices: ["athletics", "intimidation"],
        isSpellcaster: false,
        subclassLevel: 3,
      },
      update: {},
    });
    barbClassId = cls.id;
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

    // Level-1 barbarian has 2 rages; one spent.
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
    expect(res.body.hitPoints.current).toBe(34); // 40 - (12 halved to 6)
  });

  it("does NOT halve non-matching (fire) damage while raging — resistance is b/p/s only", async () => {
    await createBarbarian(L1);
    await executeAction("rage");
    const res = await damage(12, "fire");
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(28); // 40 - 12 taken in full, not halved
  });

  it("endRage clears the buff and resistance, and does NOT refund the rage use", async () => {
    await createBarbarian(L1);
    await executeAction("rage");

    const ended = await executeAction("endRage");
    expect(ended.status).toBe(200);
    expect(ragebuff(ended.body)).toBeUndefined();
    // Early end never refunds the use — endRage's op list is clearBuff only.
    expect(pool(ended.body, "rage")).toMatchObject({ used: 1, remaining: 1 });

    // Resistance is gone: subsequent bludgeoning damage is un-halved.
    const res = await damage(12, "bludgeoning");
    expect(res.body.hitPoints.current).toBe(28); // 40 - 12, full
  });

  it("LIFO revert of the activation restores the pool and removes the buff together", async () => {
    await createBarbarian(L1);
    await executeAction("rage");
    const batchId = await latestBatchId();

    const revert = await supertest
      .agent(app())
      .set("Cookie", COOKIE)
      .post(`/api/characters/${BARB_ID}/events/${batchId}/revert`);
    expect(revert.status).toBe(200);
    expect(ragebuff(revert.body)).toBeUndefined(); // buff removed
    expect(pool(revert.body, "rage")).toMatchObject({ used: 0, remaining: 2 }); // spend undone
  });
});
