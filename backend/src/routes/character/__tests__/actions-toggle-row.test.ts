/**
 * Integration round-trip for the #1686 generic "toggle" resolver, through the
 * real HTTP stack (POST /api/characters/:id/actions/transactions) — a
 * bespoke, uniquely-named ClassFeature row (testing.md's fixture-catalog-row
 * pattern, mirrors arcane-recovery.test.ts) with resolverKind "toggle" and
 * THREE effectBuffs entries: a formula modifier (abilityMod), a
 * minLevel-gated entry (a whole extra buff that only joins once the
 * character's own level reaches it — NOT the tiering mechanism), and a
 * tiered modifier (ascending minLevel, last-match-wins). All three target
 * "speed" so the summed `character.speed` wire field proves "derived stats
 * move" without needing a weapon/attack-row fixture, while each buff's own
 * evaluated `modifier` is independently checkable in `activeEffects.buffs`.
 *
 * Acceptance (#1686): activate -> buffs in activeEffects with evaluated
 * modifiers -> derived stats move -> end -> gone; LIFO undo restores; long
 * rest clears.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-actions-toggle-row";
let COOKIE: string;

const CATALOG_NAME = "Toggle Fixture Test Class";
const L1_ID = "test-actions-toggle-row-l1";
const L16_ID = "test-actions-toggle-row-l16";

let classId: string;

const BASE = {
  alignment: "True Neutral",
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 20, max: 20, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 1, die: "d8", spent: 0 },
  abilityScores: { strength: 16, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

// XP thresholds: L1 = 0, L16 = 195000.
async function createCharacter(id: string, xp: number, level: number) {
  await prisma.character.create({
    data: {
      ...BASE,
      id,
      name: `Toggle Fixture ${id}`,
      ownerId: OWNER_ID,
      experiencePoints: xp,
      classEntries: { create: [{ name: "toggle fixture", classId, position: 0, level }] },
    },
  });
}

async function seedToggleRow() {
  const cls = await prisma.characterClass.upsert({
    where: { name: CATALOG_NAME },
    create: { name: CATALOG_NAME, hitDie: "d8", savingThrows: [], skillChoiceCount: 0, skillChoices: [], isSpellcaster: false },
    update: {},
  });
  classId = cls.id;
  await prisma.classFeature.deleteMany({ where: { classId, name: "Test Toggle" } });
  await prisma.classFeature.create({
    data: {
      classId,
      subclassId: null,
      name: "Test Toggle",
      level: 1,
      edition: "EDITION_2024",
      description: "Toggle fixture row (#1686).",
      activationCost: "bonusAction",
      resolverKind: "toggle",
      resourceKey: "testToggle",
      resourceLabel: "Test Toggle",
      resourceRecharge: "longRest",
      resourceTotals: [{ minLevel: 1, total: 2 }],
      costKind: "pool",
      costPoolKey: "testToggle",
      costBase: 1,
      effectBuffs: [
        // Formula modifier: Str 16 -> +3, always present once activated.
        { key: "aFormula", target: "speed", modifier: { abilityMod: "strength" }, duration: "while-active" },
        // Entry-level minLevel gate: this WHOLE ENTRY only joins at L5+ — a
        // different axis from a tiered modifier (below), which scales the
        // value WITHIN one always-present entry.
        { key: "bLateJoiner", target: "speed", modifier: 5, duration: "while-active", minLevel: 5 },
        // Tiered modifier: ascending minLevel, last-match-wins — a L16
        // character must get exactly the top tier (3), never the sum (1+2+3=6).
        {
          key: "cTiered",
          target: "speed",
          modifier: [
            { minLevel: 1, value: 1 },
            { minLevel: 9, value: 2 },
            { minLevel: 16, value: 3 },
          ],
          duration: "while-active",
        },
      ],
    },
  });
}

interface SerializedBuff {
  key: string;
  target: string;
  modifier: number;
}

function buffs(body: { activeEffects: { buffs: SerializedBuff[] } }): SerializedBuff[] {
  return body.activeEffects.buffs;
}

function pool(body: { resources: { pools: Array<{ key: string; used: number; remaining: number }> } }, key: string) {
  return body.resources.pools.find((p) => p.key === key);
}

function executeAction(characterId: string, actionKey: string) {
  return supertest
    .agent(app)
    .set("Cookie", COOKIE)
    .post(`/api/characters/${characterId}/actions/transactions`)
    .send({ operations: [{ type: "executeAction", actionKey }] });
}

async function activity(characterId: string) {
  const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${characterId}/activity`);
  return res.body as Array<{ batchId?: string; type: string; reverted?: boolean }>;
}

describe("POST /:id/actions/transactions — generic toggle resolver (#1686)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await seedToggleRow();
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: { in: [L1_ID, L16_ID] } } });
  });

  afterAll(async () => {
    await prisma.classFeature.deleteMany({ where: { classId, name: "Test Toggle" } });
    await prisma.characterClass.deleteMany({ where: { name: CATALOG_NAME } });
  });

  it("activate: the formula + tiered buffs apply with evaluated modifiers, the minLevel-gated one is absent below its gate, and speed moves", async () => {
    await createCharacter(L1_ID, 0, 1);
    const res = await executeAction(L1_ID, "testToggle");
    expect(res.status).toBe(200);

    const active = buffs(res.body);
    expect(active.find((b) => b.key === "aFormula")).toMatchObject({ target: "speed", modifier: 3 });
    expect(active.find((b) => b.key === "cTiered")).toMatchObject({ target: "speed", modifier: 1 }); // L1 tier
    expect(active.find((b) => b.key === "bLateJoiner")).toBeUndefined(); // gated at L5, character is L1

    // speed = base 30 + aFormula(3) + cTiered(1) = 34 — derived stat moved.
    expect(res.body.speed).toBe(34);

    // The cost pool (costPoolKey "testToggle") was spent.
    expect(pool(res.body, "testToggle")).toMatchObject({ used: 1, remaining: 1 });
  });

  it("end: clears every buff the row declared, refunds nothing", async () => {
    await createCharacter(L1_ID, 0, 1);
    await executeAction(L1_ID, "testToggle");
    const ended = await executeAction(L1_ID, "endTestToggle");
    expect(ended.status).toBe(200);
    expect(buffs(ended.body)).toHaveLength(0);
    expect(ended.body.speed).toBe(30); // reverted to base
    expect(pool(ended.body, "testToggle")).toMatchObject({ used: 1, remaining: 1 }); // early end never refunds
  });

  it("a L16 character gets exactly the top tier (3), never the sum of every tier crossed (1+2+3=6), and the minLevel-gated buff now joins", async () => {
    await createCharacter(L16_ID, 195000, 16);
    const res = await executeAction(L16_ID, "testToggle");
    expect(res.status).toBe(200);

    const active = buffs(res.body);
    expect(active.find((b) => b.key === "cTiered")).toMatchObject({ modifier: 3 });
    expect(active.find((b) => b.key === "bLateJoiner")).toMatchObject({ modifier: 5 });
    // speed = 30 + aFormula(3) + bLateJoiner(5) + cTiered(3) = 41.
    expect(res.body.speed).toBe(41);
  });

  it("LIFO undo of the activation batch removes the buffs and refunds the pool together", async () => {
    await createCharacter(L1_ID, 0, 1);
    const activate = await executeAction(L1_ID, "testToggle");
    const batchId = (await activity(L1_ID)).find((e) => e.type !== "revert" && e.batchId)?.batchId;
    expect(batchId).toBeDefined();
    expect(activate.status).toBe(200);

    const revert = await supertest.agent(app).set("Cookie", COOKIE).post(`/api/characters/${L1_ID}/events/${batchId}/revert`);
    expect(revert.status).toBe(200);
    expect(buffs(revert.body)).toHaveLength(0);
    expect(pool(revert.body, "testToggle")).toMatchObject({ used: 0, remaining: 2 });
  });

  it("a long rest clears the while-active buffs (untouched rest-clearing machinery)", async () => {
    await createCharacter(L1_ID, 0, 1);
    await executeAction(L1_ID, "testToggle");
    const rest = await supertest.agent(app).set("Cookie", COOKIE).post(`/api/characters/${L1_ID}/hp`).send({ operations: [{ type: "longRest" }] });
    expect(rest.status).toBe(200);
    expect(buffs(rest.body)).toHaveLength(0);
  });
});
