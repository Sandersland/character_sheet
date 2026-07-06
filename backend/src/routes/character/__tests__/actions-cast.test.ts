/**
 * Second Wind cast-core route tests (#420).
 *
 * Second Wind now routes through castAbilityInTx (pay the secondWind pool + self-
 * apply the 1d10+level heal) instead of the op-list dispatch. These tests pin the
 * observable byte-parity the migration must preserve:
 *   - the pool is spent and the client heal roll is applied, atomically
 *   - the batch logs exactly a spendResource event + a heal event (no new cast
 *     event) — history unchanged
 *   - LIFO revert restores BOTH the pool and the HP together
 *   - no roll → spend only (no heal event); roll=0 rejected at the schema
 *   - Action Surge stays a pure counter (spend, no heal)
 *   - unknown action key → 400
 *
 * Real Postgres in beforeEach; supertest against createApp(). Uniquely-named
 * catalog fixtures per testing.md so afterAll cleanup never touches seeded rows.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../../app.js";
import { prisma } from "../../../lib/prisma.js";
import { ensureTestOwner } from "../../../test-support/owner.js";
import { authCookie } from "../../../test-support/auth.js";

const app = () => createApp();

const OWNER_ID = "owner-actions-cast";
let COOKIE: string;

const FIGHTER_ID = "test-actions-cast-fighter";
const FIGHTER_CATALOG_NAME = "Actions Cast Test Fighter";

// Level-5 Fighter (6500 XP), damaged to 20/44 so a Second Wind heal is visible.
const FIGHTER_BASE = {
  id: FIGHTER_ID,
  name: "Actions Cast Test Fighter",
  alignment: "Lawful Neutral",
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
  const res = await supertest.agent(app()).set("Cookie", COOKIE).get(`/api/characters/${FIGHTER_ID}/activity`);
  expect(res.status).toBe(200);
  return res.body as ActivityEvent[];
}

async function latestBatchId(): Promise<string> {
  const events = await activity();
  const batchId = events.find((e) => e.type !== "revert" && e.batchId)?.batchId;
  expect(batchId).toBeDefined();
  return batchId!;
}

function execute(actionKey: string, roll?: number) {
  return supertest
    .agent(app())
    .set("Cookie", COOKIE)
    .post(`/api/characters/${FIGHTER_ID}/actions/transactions`)
    .send({ operations: [{ type: "executeAction", actionKey, ...(roll !== undefined ? { roll } : {}) }] });
}

function pool(body: { resources: { pools: Array<{ key: string; used: number; remaining: number }> } }, key: string) {
  return body.resources.pools.find((p) => p.key === key)!;
}

describe("POST /:id/actions/transactions — Second Wind via the cast core (#420)", () => {
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

  it("spends the pool and applies the client heal roll atomically", async () => {
    const res = await execute("secondWind", 7);
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(27); // 20 + 7
    expect(pool(res.body, "secondWind")).toMatchObject({ used: 1, remaining: 0 });
  });

  it("logs exactly a spendResource + heal event, and no cast event (history unchanged)", async () => {
    await execute("secondWind", 6);
    const batchId = await latestBatchId();
    const inBatch = (await activity()).filter((e) => e.batchId === batchId);
    const types = inBatch.map((e) => e.type).sort();
    expect(types).toEqual(["heal", "spendResource"]);
    expect(types).not.toContain("castSpell");
    expect(types).not.toContain("castManeuver");
  });

  it("LIFO revert restores BOTH the pool and the HP together", async () => {
    await execute("secondWind", 9);
    const batchId = await latestBatchId();
    const revert = await supertest
      .agent(app())
      .set("Cookie", COOKIE)
      .post(`/api/characters/${FIGHTER_ID}/events/${batchId}/revert`);
    expect(revert.status).toBe(200);
    expect(revert.body.hitPoints.current).toBe(20); // heal undone
    expect(pool(revert.body, "secondWind")).toMatchObject({ used: 0, remaining: 1 }); // spend undone
  });

  it("without a roll: spends the pool but applies no heal", async () => {
    const res = await execute("secondWind");
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(20); // unchanged
    expect(pool(res.body, "secondWind")).toMatchObject({ used: 1, remaining: 0 });

    const batchId = await latestBatchId();
    const types = (await activity()).filter((e) => e.batchId === batchId).map((e) => e.type);
    expect(types).toEqual(["spendResource"]); // no heal at 0
  });

  it("roll=0 is rejected at the schema (roll must be positive) → 400, pool untouched", async () => {
    const res = await execute("secondWind", 0);
    expect(res.status).toBe(400);
    const check = await supertest.agent(app()).set("Cookie", COOKIE).get(`/api/characters/${FIGHTER_ID}`);
    expect(pool(check.body, "secondWind")).toMatchObject({ used: 0, remaining: 1 });
  });

  it("second Second Wind fails with 400 once the pool is exhausted (whole batch rolls back)", async () => {
    await execute("secondWind", 5);
    const res = await execute("secondWind", 5);
    expect(res.status).toBe(400);
  });

  it("Action Surge stays a pure counter — spends actionSurge, no heal", async () => {
    const res = await execute("actionSurge");
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(20); // no heal
    expect(pool(res.body, "actionSurge").used).toBe(1);

    const batchId = await latestBatchId();
    const types = (await activity()).filter((e) => e.batchId === batchId).map((e) => e.type);
    expect(types).toEqual(["spendResource"]);
  });

  it("unknown action key → 400", async () => {
    const res = await execute("notAnAction", 3);
    expect(res.status).toBe(400);
  });
});
