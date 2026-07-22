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
const HEIGHTENED_MONK_ID = "test-actions-monk-focus-heightened";
const MONK_CATALOG_NAME = "Actions Monk Focus Test Monk";
let monkClassId: string;

// XP threshold for level 2 (single-class): both Patient Defense and Step of
// the Wind grant at monk L2.
const L2_XP = 300;
// XP threshold for level 10 (single-class): Heightened Focus (#1244).
const L10_XP = 64000;

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

// Heightened Focus (monk L10, #1244) fixture — a separate character/id so the
// L2 tests above stay untouched.
async function createHeightenedMonk() {
  await prisma.character.create({
    data: {
      ...MONK_BASE,
      id: HEIGHTENED_MONK_ID,
      name: "Actions Monk Focus Test (Heightened)",
      experiencePoints: L10_XP,
      ownerId: OWNER_ID,
      classEntries: { create: [{ name: "monk", classId: monkClassId, position: 0, level: 10 }] },
    },
  });
}

async function activity(characterId: string = MONK_ID): Promise<ActivityEvent[]> {
  const res = await supertest.agent(app()).set("Cookie", COOKIE).get(`/api/characters/${characterId}/activity`);
  expect(res.status).toBe(200);
  return res.body as ActivityEvent[];
}

function executeAction(actionKey: string, characterId: string = MONK_ID) {
  return supertest
    .agent(app())
    .set("Cookie", COOKIE)
    .post(`/api/characters/${characterId}/actions/transactions`)
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

  // Heightened Focus (monk L10, #1244) grants no temp HP below L10 — see the
  // dedicated describe block below for the L10+ roll.
  it("patientDefenseFocus grants no temp HP below monk L10", async () => {
    const res = await executeAction("patientDefenseFocus");
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.temp).toBe(0);
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

// Deflect Attacks — Redirect (#1241): the reaction's base 1d10+Dex+level
// reduction is a pure client-side roll (no server call — see
// useDeflectAttacksReaction's header comment), but the optional Redirect once
// a ranged hit is reduced to 0 is a real 1-Focus spend through this same
// route. actions.test.ts (lib) already pins ACTION_EFFECT_FN.deflectAttacksRedirect's
// pure output and TurnHub.test.tsx pins the UI wiring; this closes the gap
// pattern-matched from patientDefenseFocus/stepOfTheWindFocus above — an actual
// HTTP round trip through the real focus pool, never previously exercised.
describe("POST /:id/actions/transactions — Deflect Attacks Redirect (#1241)", () => {
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

  it("deflectAttacksRedirect spends exactly 1 focus (level-2 monk has a 2-focus pool)", async () => {
    const res = await executeAction("deflectAttacksRedirect");
    expect(res.status).toBe(200);
    expect(pool(res.body, "focus")).toMatchObject({ used: 1, remaining: 1 });
  });

  it("the deflectAttacksRedirect spend is logged as a session/activity spendResource event", async () => {
    await executeAction("deflectAttacksRedirect");
    const events = await activity();
    const spend = events.find((e) => e.type === "spendResource" && e.data?.key === "focus");
    expect(spend).toBeDefined();
  });

  it("rejects a second deflectAttacksRedirect once the shared focus pool is exhausted", async () => {
    const first = await executeAction("deflectAttacksRedirect");
    expect(first.status).toBe(200);
    expect(pool(first.body, "focus")).toMatchObject({ used: 1, remaining: 1 });

    const second = await executeAction("deflectAttacksRedirect");
    expect(second.status).toBe(200);
    expect(pool(second.body, "focus")).toMatchObject({ used: 2, remaining: 0 });

    const third = await executeAction("deflectAttacksRedirect");
    expect(third.status).toBe(400); // pool exhausted
  });
});

describe("POST /:id/actions/transactions — Heightened Focus temp HP (monk L10, #1244)", () => {
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
    await createHeightenedMonk();
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: HEIGHTENED_MONK_ID } });
  });

  // Martial Arts die at monk L10 is 1d8 (deriveMartialArtsDie), so two rolls
  // land in [2, 16] — the server rolls both dice itself (rollDie, no client
  // input), like Uncanny Metabolism's bonusHeal (#1243).
  it("patientDefenseFocus grants temp HP = two Martial Arts die rolls (2-16) at monk L10+", async () => {
    const res = await executeAction("patientDefenseFocus", HEIGHTENED_MONK_ID);
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.temp).toBeGreaterThanOrEqual(2);
    expect(res.body.hitPoints.temp).toBeLessThanOrEqual(16);
  });

  it("the temp HP grant is logged as a session/activity setTemp event", async () => {
    await executeAction("patientDefenseFocus", HEIGHTENED_MONK_ID);
    const events = await activity(HEIGHTENED_MONK_ID);
    const setTemp = events.find((e) => e.type === "setTemp");
    expect(setTemp).toBeDefined();
  });

  it("stepOfTheWindFocus still spends exactly 1 focus and grants no temp HP (the move-ally rider is narrated only)", async () => {
    const res = await executeAction("stepOfTheWindFocus", HEIGHTENED_MONK_ID);
    expect(res.status).toBe(200);
    expect(pool(res.body, "focus")).toMatchObject({ used: 1, remaining: 9 });
    expect(res.body.hitPoints.temp).toBe(0);
  });
});
