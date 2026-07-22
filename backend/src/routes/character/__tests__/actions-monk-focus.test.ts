/**
 * Patient Defense / Step of the Wind route tests (#1240) — the free vs 1-Focus
 * variants exercised through the real HTTP stack (POST
 * /api/characters/:id/actions/transactions), mirroring actions-rage.test.ts's
 * pattern for the Monk's `focus` pool.
 *
 * PHB'24 p.98 / SRD 5.2: each grants a free bonus-action option (Disengage /
 * Dash) plus a 1-Focus option that does more (Disengage+Dodge /
 * Disengage+Dash+doubled jump) — not the 2014 SRD's flat "always costs 1 ki"
 * shape. The free variants are economy-only client-side reminders (like Shadow
 * Step/Opportunist, #440): they have no ACTION_EFFECT_FN/ACTION_CAST_FN entry,
 * so the route rejects them as an unknown action key if ever sent — proving
 * the free variants can never reach the server, only the Focus variants do.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const app = () => createApp();

const OWNER_ID = "owner-actions-monk-focus";
let COOKIE: string;

const MONK_ID = "test-actions-monk-focus";
const MONK_CATALOG_NAME = "Actions Monk Focus Test Monk";
let monkClassId: string;

// XP threshold for level 2 (single-class): both Patient Defense and Step of
// the Wind grant at monk L2.
const L2_XP = 300;

const MONK_BASE = {
  id: MONK_ID,
  name: "Actions Monk Focus Test",
  alignment: "Lawful Neutral",
  initiativeBonus: 2,
  speed: 30,
  hitPoints: { current: 16, max: 16, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 2, die: "d8", spent: 0 },
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
  batchId?: string;
  type: string;
  data?: Record<string, unknown>;
}

async function createMonk() {
  await prisma.character.create({
    data: {
      ...MONK_BASE,
      experiencePoints: L2_XP,
      ownerId: OWNER_ID,
      classEntries: { create: [{ name: "monk", classId: monkClassId, position: 0, level: 2 }] },
    },
  });
}

async function activity(): Promise<ActivityEvent[]> {
  const res = await supertest.agent(app()).set("Cookie", COOKIE).get(`/api/characters/${MONK_ID}/activity`);
  expect(res.status).toBe(200);
  return res.body as ActivityEvent[];
}

function executeAction(actionKey: string) {
  return supertest
    .agent(app())
    .set("Cookie", COOKIE)
    .post(`/api/characters/${MONK_ID}/actions/transactions`)
    .send({ operations: [{ type: "executeAction", actionKey }] });
}

function pool(body: { resources: { pools: Array<{ key: string; used: number; remaining: number }> } }, key: string) {
  return body.resources.pools.find((p) => p.key === key)!;
}

describe("POST /:id/actions/transactions — Patient Defense / Step of the Wind (#1240)", () => {
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

  it("patientDefenseFocus spends exactly 1 focus (level-2 monk has a 2-focus pool)", async () => {
    const res = await executeAction("patientDefenseFocus");
    expect(res.status).toBe(200);
    expect(pool(res.body, "focus")).toMatchObject({ used: 1, remaining: 1 });
  });

  it("stepOfTheWindFocus spends exactly 1 focus", async () => {
    const res = await executeAction("stepOfTheWindFocus");
    expect(res.status).toBe(200);
    expect(pool(res.body, "focus")).toMatchObject({ used: 1, remaining: 1 });
  });

  it("the patientDefenseFocus spend is logged as a session/activity spendResource event", async () => {
    await executeAction("patientDefenseFocus");
    const events = await activity();
    const spend = events.find((e) => e.type === "spendResource" && e.data?.key === "focus");
    expect(spend).toBeDefined();
  });

  it("the stepOfTheWindFocus spend is logged as a session/activity spendResource event", async () => {
    await executeAction("stepOfTheWindFocus");
    const events = await activity();
    const spend = events.find((e) => e.type === "spendResource" && e.data?.key === "focus");
    expect(spend).toBeDefined();
  });

  // The free variants (Disengage-only / Dash-only) are economy-only client-side
  // reminders — like Shadow Step/Opportunist (#440) — with no backend
  // ACTION_EFFECT_FN/ACTION_CAST_FN entry. planActionClick never calls send()
  // for a serverEffect:false resolver, so these keys should never actually
  // reach this route; this pins that the route rejects them if they ever did,
  // rather than silently no-opping.
  it("patientDefense (free variant) is not a known server action key", async () => {
    const res = await executeAction("patientDefense");
    expect(res.status).toBe(400);
  });

  it("stepOfTheWind (free variant) is not a known server action key", async () => {
    const res = await executeAction("stepOfTheWind");
    expect(res.status).toBe(400);
  });

  it("spending both patientDefenseFocus and flurryOfBlows in the same turn draws down the shared focus pool correctly", async () => {
    // Level-2 monk: 2 focus total. Patient Defense (1) + Flurry (1, #1217) drains
    // the pool to 0 — proves the two Focus-spending bonus actions share one real
    // pool, not independent budgets. A third Focus spend then 400s (empty pool).
    const first = await executeAction("patientDefenseFocus");
    expect(first.status).toBe(200);
    expect(pool(first.body, "focus")).toMatchObject({ used: 1, remaining: 1 });

    const second = await executeAction("flurryOfBlows");
    expect(second.status).toBe(200);
    expect(pool(second.body, "focus")).toMatchObject({ used: 2, remaining: 0 });

    const third = await executeAction("stepOfTheWindFocus");
    expect(third.status).toBe(400); // pool exhausted — no focus remains
  });
});
