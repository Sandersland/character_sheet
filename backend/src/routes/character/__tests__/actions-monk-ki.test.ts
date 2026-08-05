/**
 * 2014 Monk ki action route tests (#1500) — Flurry of Blows / Patient
 * Defense / Step of the Wind / Deflect Missiles' throw-back, exercised
 * through the real HTTP stack (POST /api/characters/:id/actions/transactions),
 * mirroring actions-monk-focus.test.ts's pattern but for the "ki" pool.
 *
 * SRD 5.1 / PHB'14 p.77: each of the three base ki-spend options is a flat
 * 1-ki cost with no free variant, unlike 2024's free/paid pair — so
 * patientDefenseKi/stepOfTheWindKi are each a SINGLE action key, not a
 * two-menu-entry pair.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-actions-monk-ki";
let COOKIE: string;

const MONK_ID = "test-actions-monk-ki";
const MONK_CATALOG_NAME = "Actions Monk Ki Test Monk";
let monkClassId: string;

// XP threshold for level 3 (single-class): Deflect Missiles grants at L3;
// Flurry/Patient Defense/Step of the Wind already active at L2.
const L3_XP = 900;

const MONK_BASE = {
  id: MONK_ID,
  name: "Actions Monk Ki Test",
  alignment: "Lawful Neutral",
  initiativeBonus: 2,
  speed: 30,
  hitPoints: { current: 20, max: 20, temp: 0, deathSaves: { successes: 0, failures: 0 } },
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
  rulesEdition: "EDITION_2014" as const,
};

interface ActivityEvent {
  batchId?: string;
  type: string;
  data?: Record<string, unknown>;
}

async function createMonk() {
  await prisma.character.create({
    data: {
      ...MONK_BASE,
      experiencePoints: L3_XP,
      ownerId: OWNER_ID,
      classEntries: { create: [{ name: "monk", classId: monkClassId, position: 0, level: 3 }] },
    },
  });
}

async function activity(characterId: string = MONK_ID): Promise<ActivityEvent[]> {
  const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${characterId}/activity`);
  expect(res.status).toBe(200);
  return res.body as ActivityEvent[];
}

function executeAction(actionKey: string, characterId: string = MONK_ID) {
  return supertest
    .agent(app)
    .set("Cookie", COOKIE)
    .post(`/api/characters/${characterId}/actions/transactions`)
    .send({ operations: [{ type: "executeAction", actionKey }] });
}

function pool(body: { resources: { pools: Array<{ key: string; used: number; remaining: number }> } }, key: string) {
  return body.resources.pools.find((p) => p.key === key)!;
}

describe("POST /:id/actions/transactions — 2014 Monk ki actions (#1500)", () => {
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

  it("flurryOfBlows spends exactly 1 ki (not focus) for a 2014 monk", async () => {
    const res = await executeAction("flurryOfBlows");
    expect(res.status).toBe(200);
    expect(pool(res.body, "ki")).toMatchObject({ used: 1, remaining: 2 }); // 3 total at L3
    expect(res.body.resources.pools.find((p: { key: string }) => p.key === "focus")).toBeUndefined();
  });

  it("patientDefenseKi spends exactly 1 ki — a single row, not a free/paid pair", async () => {
    const res = await executeAction("patientDefenseKi");
    expect(res.status).toBe(200);
    expect(pool(res.body, "ki")).toMatchObject({ used: 1, remaining: 2 });
  });

  it("stepOfTheWindKi spends exactly 1 ki", async () => {
    const res = await executeAction("stepOfTheWindKi");
    expect(res.status).toBe(200);
    expect(pool(res.body, "ki")).toMatchObject({ used: 1, remaining: 2 });
  });

  it("patientDefense/stepOfTheWind (the 2024 keys) are not known server action keys for a 2014 monk", async () => {
    const patientDefense = await executeAction("patientDefense");
    expect(patientDefense.status).toBe(400);
    const stepOfTheWind = await executeAction("stepOfTheWind");
    expect(stepOfTheWind.status).toBe(400);
    const patientDefenseFocus = await executeAction("patientDefenseFocus");
    expect(patientDefenseFocus.status).toBe(400);
  });

  it("the patientDefenseKi spend is logged as a session/activity spendResource event keyed 'ki'", async () => {
    await executeAction("patientDefenseKi");
    const events = await activity();
    const spend = events.find((e) => e.type === "spendResource" && e.data?.key === "ki");
    expect(spend).toBeDefined();
  });

  it("deflectMissilesThrow spends exactly 1 ki (granted at L3)", async () => {
    const res = await executeAction("deflectMissilesThrow");
    expect(res.status).toBe(200);
    expect(pool(res.body, "ki")).toMatchObject({ used: 1, remaining: 2 });
  });

  // LIFO undo (#758): revert-batch must restore the ki pool exactly, the same
  // generic path every other resource spend (focus/wildShape/channelDivinity/
  // etc.) already proves — mirrors shadow-arts-cast.test.ts's own
  // "revert refunds focus" pattern, just against the new "ki" pool key.
  it("logs an undoable spend: revert restores the ki pool (LIFO undo, #758)", async () => {
    const spent = await executeAction("patientDefenseKi");
    expect(spent.status).toBe(200);
    expect(pool(spent.body, "ki")).toMatchObject({ used: 1, remaining: 2 });

    const events = await activity();
    const batchId = events.find((e) => e.type === "spendResource" && e.data?.key === "ki")!.batchId!;
    const undo = await supertest.agent(app).set("Cookie", COOKIE).post(`/api/characters/${MONK_ID}/events/${batchId}/revert`);
    expect(undo.status).toBe(200);
    expect(pool(undo.body, "ki")).toMatchObject({ used: 0, remaining: 3 });
  });

  it("spending flurryOfBlows, patientDefenseKi, and stepOfTheWindKi in the same turn draws down the shared ki pool correctly", async () => {
    // Level-3 monk: 3 ki total. Three 1-ki spends drain it to 0; a fourth 400s.
    const first = await executeAction("flurryOfBlows");
    expect(first.status).toBe(200);
    expect(pool(first.body, "ki")).toMatchObject({ used: 1, remaining: 2 });

    const second = await executeAction("patientDefenseKi");
    expect(second.status).toBe(200);
    expect(pool(second.body, "ki")).toMatchObject({ used: 2, remaining: 1 });

    const third = await executeAction("stepOfTheWindKi");
    expect(third.status).toBe(200);
    expect(pool(third.body, "ki")).toMatchObject({ used: 3, remaining: 0 });

    const fourth = await executeAction("deflectMissilesThrow");
    expect(fourth.status).toBe(400); // pool exhausted — no ki remains
  });
});

// A 2024 monk sibling — proves the SAME actionKey ("flurryOfBlows") resolves
// to the CORRECT pool per edition end-to-end, not just at the unit layer
// (actions.test.ts already pins ACTION_EFFECT_FN.flurryOfBlows's pure output).
describe("POST /:id/actions/transactions — flurryOfBlows spends focus (not ki) for a 2024 monk", () => {
  const MONK_2024_ID = "test-actions-monk-ki-2024-sibling";

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
    await prisma.character.create({
      data: {
        ...MONK_BASE,
        id: MONK_2024_ID,
        rulesEdition: "EDITION_2024",
        experiencePoints: L3_XP,
        ownerId: OWNER_ID,
        classEntries: { create: [{ name: "monk", classId: monkClassId, position: 0, level: 3 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: MONK_2024_ID } });
  });

  it("flurryOfBlows spends exactly 1 focus (not ki) for a 2024 monk", async () => {
    const res = await executeAction("flurryOfBlows", MONK_2024_ID);
    expect(res.status).toBe(200);
    expect(pool(res.body, "focus")).toMatchObject({ used: 1, remaining: 2 }); // 3 total at L3
    expect(res.body.resources.pools.find((p: { key: string }) => p.key === "ki")).toBeUndefined();
  });
});
