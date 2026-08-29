import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-actions-slot-cost";
let COOKIE: string;

const WIZARD_ID = "test-actions-slot-cost-wizard";
const WIZARD_CATALOG_NAME = "Actions Slot Cost Test Wizard";

const WIZARD_BASE = {
  id: WIZARD_ID,
  name: "Actions Slot Cost Test Wizard",
  alignment: "Neutral Good",
  rulesEdition: "EDITION_2014" as const,
  experiencePoints: 6500,
  initiativeBonus: 2,
  speed: 30,
  hitPoints: { current: 20, max: 33, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 5, die: "d6", spent: 0 },
  abilityScores: {
    strength: 8,
    dexterity: 14,
    constitution: 14,
    intelligence: 16,
    wisdom: 12,
    charisma: 10,
  },
  savingThrowProficiencies: ["intelligence", "wisdom"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

const SLOT_ABILITY_KEY = "testSlotCostAbility";

interface ActivityEvent {
  batchId?: string;
  type: string;
  category: string;
}

async function activity(): Promise<ActivityEvent[]> {
  const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${WIZARD_ID}/activity`);
  expect(res.status).toBe(200);
  return res.body as ActivityEvent[];
}

async function latestBatchId(): Promise<string> {
  const events = await activity();
  const batchId = events.find((e) => e.type !== "revert" && e.batchId)?.batchId;
  expect(batchId).toBeDefined();
  return batchId!;
}

function execute(slotLevel?: number) {
  return supertest
    .agent(app)
    .set("Cookie", COOKIE)
    .post(`/api/characters/${WIZARD_ID}/actions/transactions`)
    .send({ operations: [{ type: "executeAction", actionKey: SLOT_ABILITY_KEY, ...(slotLevel ? { slotLevel } : {}) }] });
}

function slot(body: { spellcasting: { slots: Array<{ level: number; total: number; used: number }> } }, level: number) {
  return body.spellcasting.slots.find((s) => s.level === level)!;
}

describe("POST /:id/actions/transactions — slot-shaped ability cost (#1687)", () => {
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: WIZARD_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: WIZARD_CATALOG_NAME },
      create: {
        name: WIZARD_CATALOG_NAME,
        hitDie: "d6",
        savingThrows: ["intelligence", "wisdom"],
        skillChoiceCount: 2,
        skillChoices: ["arcana", "history"],
        isSpellcaster: true,
        subclassLevel: 2,
      },
      update: {},
    });
    await prisma.classFeature.deleteMany({ where: { classId: cls.id } });
    await prisma.classFeature.create({
      data: {
        classId: cls.id,
        name: "Test Slot Cost Ability",
        level: 1,
        description: "Test-only slot-cost fixture ability (#1687).",
        edition: "EDITION_2014",
        resourceKey: SLOT_ABILITY_KEY,
        activationCost: "reaction",
        // costKind "slot" reuses costBase as the minimum slot level (#1687).
        costKind: "slot",
        costBase: 1,
        effectKind: "heal",
        effectDiceCount: 1,
        effectDiceFaces: 4,
      },
    });

    await prisma.character.create({
      data: {
        ...WIZARD_BASE,
        ownerId: OWNER_ID,
        classEntries: { create: [{ name: "wizard", classId: cls.id, position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: WIZARD_ID } });
  });

  it("casting at slot level 3 expends exactly one level-3 slot (level-1 untouched)", async () => {
    const res = await execute(3);
    expect(res.status).toBe(200);
    expect(slot(res.body, 3)).toMatchObject({ total: 2, used: 1 });
    expect(slot(res.body, 1)).toMatchObject({ total: 4, used: 0 });
  });

  it("heals via the row's effect dice, reported in `results`", async () => {
    const res = await execute(3);
    expect(res.status).toBe(200);
    const roll = res.body.results[0].roll as number;
    expect(roll).toBeGreaterThanOrEqual(1);
    expect(roll).toBeLessThanOrEqual(4);
    expect(res.body.hitPoints.current).toBe(20 + roll);
  });

  it("logs an undoable spellcasting-category spend event alongside the heal event", async () => {
    await execute(3);
    const batchId = await latestBatchId();
    const inBatch = (await activity()).filter((e) => e.batchId === batchId);
    const categories = inBatch.map((e) => e.category).sort();
    expect(categories).toEqual(["hitPoints", "spellcasting"]);
  });

  it("LIFO revert restores BOTH the slot and the HP together", async () => {
    await execute(3);
    const batchId = await latestBatchId();
    const revert = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post(`/api/characters/${WIZARD_ID}/events/${batchId}/revert`);
    expect(revert.status).toBe(200);
    expect(revert.body.hitPoints.current).toBe(20);
    expect(slot(revert.body, 3)).toMatchObject({ used: 0 });
  });

  it("no level-3 slots remaining → 400 with the existing no-slot message", async () => {
    await execute(3);
    await execute(3);
    const res = await execute(3);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No level-3 spell slots remaining/);
  });

  it("omitted slotLevel defaults to the ability's own minimum (L1)", async () => {
    const res = await execute();
    expect(res.status).toBe(200);
    expect(slot(res.body, 1)).toMatchObject({ used: 1 });
  });
});
