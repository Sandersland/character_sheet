/**
 * PHB'24 p.98 / SRD 5.2: Patient Defense and Step of the Wind each grant a
 * free bonus-action option plus a stronger 1-Focus option — unlike the 2014
 * SRD's flat "always costs 1 ki" shape.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-actions-monk-focus";
let COOKIE: string;

const MONK_ID = "test-actions-monk-focus";
const HEIGHTENED_MONK_ID = "test-actions-monk-focus-heightened";
const MONK_CATALOG_NAME = "Actions Monk Focus Test Monk";
let monkClassId: string;

const L2_XP = 300; // single-class monk level 2
const L10_XP = 64000; // single-class monk level 10 (Heightened Focus)

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

async function seedFocusActionRows(classId: string) {
  await prisma.classFeature.deleteMany({ where: { classId } });
  await prisma.classFeature.createMany({
    data: [
      {
        classId, subclassId: null, name: "Focus", level: 2, edition: "EDITION_2024",
        description: "You have a pool of Focus Points equal to your monk level.",
        resourceKey: "focus", resourceLabel: "Focus Points", resourceRecharge: "short-or-long",
        resourceTotals: [{ minLevel: 2, total: { levelTimes: 1 } }],
      },
      {
        classId, subclassId: null, name: "Flurry of Blows", level: 2, edition: "EDITION_2024",
        description: "Immediately after the Attack action, spend 1 focus to make two Unarmed Strikes as a Bonus Action (three at Heightened Focus, monk L10).",
        resourceKey: "flurryOfBlows", activationCost: "bonusAction", costKind: "pool", costPoolKey: "focus", costBase: 1, count: 2, actionOnly: true,
      },
      {
        classId, subclassId: null, name: "Patient Defense (1 Focus)", level: 2, edition: "EDITION_2024",
        description: "Spend 1 Focus to take Disengage + Dodge together as a Bonus Action (also grants temporary hit points at Heightened Focus, monk L10).",
        resourceKey: "patientDefenseFocus", activationCost: "bonusAction", costKind: "pool", costPoolKey: "focus", costBase: 1,
        regrants: ["disengage", "dodge"], actionOnly: true,
      },
      {
        classId, subclassId: null, name: "Step of the Wind (1 Focus)", level: 2, edition: "EDITION_2024",
        description: "Spend 1 Focus to take Disengage + Dash together as a Bonus Action, jump distance doubled this turn (also brings a willing creature along at Heightened Focus, monk L10).",
        resourceKey: "stepOfTheWindFocus", activationCost: "bonusAction", costKind: "pool", costPoolKey: "focus", costBase: 1,
        regrants: ["disengage", "dash"], actionOnly: true,
      },
      {
        classId, subclassId: null, name: "Deflect Attacks — Redirect", level: 3, edition: "EDITION_2024",
        description: "Once Deflect Attacks reduces a hit to 0, spend 1 Focus to redirect the damage at the attacker (melee) or another creature within range (ranged), forcing a Dexterity save.",
        resourceKey: "deflectAttacksRedirect", activationCost: "free", costKind: "pool", costPoolKey: "focus", costBase: 1, actionOnly: true,
      },
    ],
  });
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
    await seedFocusActionRows(monkClassId);
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

  // The free variants have no backend action entry and must 400, not silently no-op.
  it("patientDefense (free variant) is not a known server action key", async () => {
    const res = await executeAction("patientDefense");
    expect(res.status).toBe(400);
  });

  it("stepOfTheWind (free variant) is not a known server action key", async () => {
    const res = await executeAction("stepOfTheWind");
    expect(res.status).toBe(400);
  });

  it("spending both patientDefenseFocus and flurryOfBlows in the same turn draws down the shared focus pool correctly", async () => {
    // Level-2 monk: 2 focus total, shared across every Focus-spending action.
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
    await seedFocusActionRows(monkClassId);
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
    await seedFocusActionRows(monkClassId);
    await createHeightenedMonk();
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: HEIGHTENED_MONK_ID } });
  });

  // Martial Arts die is 1d8 at monk L10 (deriveMartialArtsDie); the server
  // rolls both dice itself, so two rolls land in [2, 16].
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
