/**
 * Second Wind row-driven cast-core route tests (#420, re-mechanized #1528).
 *
 * Second Wind is row-driven now: castSpecFromRow reads its ClassFeature row
 * (resourceKey/costKind/effectKind/effectModifierSource) and the SERVER rolls
 * 1d10 + Fighter level (castManeuver, maneuvers.ts, is the server-roll
 * precedent) — the client no longer sends `roll`. These tests pin the
 * observable behaviour the migration must preserve:
 *   - the pool is spent and the server-rolled heal is applied, atomically
 *   - the roll is reported back via `results[0].roll` (#1528 wire contract)
 *   - the batch logs exactly a spendResource event + a heal event (no new cast
 *     event) — history unchanged
 *   - LIFO revert restores BOTH the pool and the HP together
 *   - Action Surge stays a pure counter (spend, no heal), dispatched via the
 *     same row-driven path but with no effectKind
 *   - unknown action key → 400
 *
 * Real Postgres in beforeEach; supertest against createApp(). Uniquely-named
 * catalog fixtures per testing.md so afterAll cleanup never touches seeded
 * rows — fighterResourceRowsData seeds this fixture's OWN ClassFeature rows
 * (#1528: Second Wind/Action Surge are tied to a specific classId now, not
 * derivable from the class NAME alone), cascade-deleted with the class.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { fighterResourceRowsData } from "@/test-support/fighter-resource-rows.js";

const app = () => createApp();

const OWNER_ID = "owner-actions-cast";
let COOKIE: string;

const FIGHTER_ID = "test-actions-cast-fighter";
const FIGHTER_CATALOG_NAME = "Actions Cast Test Fighter";

// Level-5 Fighter (6500 XP), damaged to 20/44 so a Second Wind heal is visible.
// Pinned to EDITION_2014 (#1227): this suite is about the CAST MECHANISM (pool
// spend + heal + revert atomicity), not resource counts, and 2014's Second
// Wind stays a single-use pool (byte-identical to before #1227) — the
// default EDITION_2024 now grants 3 uses at level 5, which would make
// "second cast fails once exhausted" require two casts first, entangling an
// unrelated content change into a mechanism test.
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

// No client-supplied roll (#1528) — the server rolls a row-driven cast-core
// action itself; a still-client-rolled action (layOnHands, etc.) is out of
// this suite's scope.
function execute(actionKey: string) {
  return supertest
    .agent(app())
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
    // 1d10 + Fighter level 5 → 6-15.
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
      .agent(app())
      .set("Cookie", COOKIE)
      .post(`/api/characters/${FIGHTER_ID}/events/${batchId}/revert`);
    expect(revert.status).toBe(200);
    expect(revert.body.hitPoints.current).toBe(20); // heal undone
    void roll;
    expect(pool(revert.body, "secondWind")).toMatchObject({ used: 0, remaining: 1 }); // spend undone
  });

  it("second Second Wind fails with 400 once the pool is exhausted (whole batch rolls back)", async () => {
    await execute("secondWind");
    const res = await execute("secondWind");
    expect(res.status).toBe(400);
  });

  it("Action Surge stays a pure counter — spends actionSurge, no heal, no roll reported", async () => {
    const res = await execute("actionSurge");
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(20); // no heal
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
