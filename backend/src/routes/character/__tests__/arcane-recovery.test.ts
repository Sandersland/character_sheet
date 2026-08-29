import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-arcane-recovery";
let COOKIE: string;

const XP_LVL_8 = 34000;

const WIZARD_ID = "arcane-recovery-wizard";
const FIGHTER_ID = "arcane-recovery-fighter";

const WIZARD_CATALOG_NAME = "Arcane Recovery Test Wizard";
const FIGHTER_CATALOG_NAME = "Arcane Recovery Test Fighter";

const BASE = {
  alignment: "Neutral Good",
  initiativeBonus: 1,
  speed: 30,
  abilityScores: { strength: 8, dexterity: 12, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: ["intelligence", "wisdom"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

const EXPENDED_SPELLCASTING = {
  slotsUsed: { "1": 2, "2": 3, "3": 1 },
  arcanumUsed: {},
  spells: [],
  concentratingOn: null,
};

const url = (id: string) => `/api/characters/${id}/spellcasting/transactions`;

let wizardClassId: string;
let fighterClassId: string;

beforeEach(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);

  const wiz = await prisma.characterClass.upsert({
    where: { name: WIZARD_CATALOG_NAME },
    create: { name: WIZARD_CATALOG_NAME, hitDie: "d6", savingThrows: ["intelligence", "wisdom"], skillChoiceCount: 2, skillChoices: ["arcana"], isSpellcaster: true },
    update: {},
  });
  wizardClassId = wiz.id;
  // resolveArcaneRecoveryContext reads pools from ClassFeature rows, not a shared resourceFn — this fixture class needs its own Arcane Recovery row (#1234).
  await prisma.classFeature.deleteMany({ where: { classId: wizardClassId, name: "Arcane Recovery" } });
  await prisma.classFeature.createMany({
    data: (["EDITION_2014", "EDITION_2024"] as const).map((edition) => ({
      classId: wizardClassId,
      subclassId: null,
      name: "Arcane Recovery",
      level: 1,
      edition,
      description: "Arcane Recovery test fixture row.",
      resourceKey: "arcaneRecovery",
      resourceLabel: "Arcane Recovery",
      resourceRecharge: "longRest",
      resourceTotals: [{ minLevel: 1, total: 1 }],
    })),
  });
  const fig = await prisma.characterClass.upsert({
    where: { name: FIGHTER_CATALOG_NAME },
    create: { name: FIGHTER_CATALOG_NAME, hitDie: "d10", savingThrows: ["strength", "constitution"], skillChoiceCount: 2, skillChoices: ["athletics"], isSpellcaster: false },
    update: {},
  });
  fighterClassId = fig.id;

  await prisma.character.create({
    data: {
      ...BASE,
      id: WIZARD_ID,
      name: "Arcane Recovery Wizard",
      ownerId: OWNER_ID,
      experiencePoints: XP_LVL_8,
      hitPoints: { current: 40, max: 40, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 8, die: "d6", spent: 0 },
      spellcasting: EXPENDED_SPELLCASTING as Prisma.InputJsonValue,
      classEntries: { create: [{ name: "wizard", classId: wizardClassId, position: 0, level: 8 }] },
    },
  });
  await prisma.character.create({
    data: {
      ...BASE,
      id: FIGHTER_ID,
      name: "Arcane Recovery Fighter",
      ownerId: OWNER_ID,
      experiencePoints: XP_LVL_8,
      hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 8, die: "d10", spent: 0 },
      spellcasting: Prisma.JsonNull,
      classEntries: { create: [{ name: "fighter", classId: fighterClassId, position: 0, level: 8 }] },
    },
  });
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: { in: [WIZARD_ID, FIGHTER_ID] } } });
});

afterAll(async () => {
  await prisma.characterClass.deleteMany({ where: { name: { in: [WIZARD_CATALOG_NAME, FIGHTER_CATALOG_NAME] } } });
});

function slot(body: { spellcasting: { slots: Array<{ level: number; used: number; total: number }> } }, level: number) {
  return body.spellcasting.slots.find((s) => s.level === level);
}

function pool(body: { resources: { pools: Array<{ key: string; used: number; remaining: number }> } }, key: string) {
  return body.resources.pools.find((p) => p.key === key);
}

describe("POST spellcasting/transactions — arcaneRecovery (#904)", () => {
  it("level-8 wizard recovers up to 4 slot-levels of expended slots, once", async () => {
    const res = await supertest(app).post(url(WIZARD_ID)).set("Cookie", COOKIE)
      .send({ operations: [{ type: "arcaneRecovery", slots: [{ level: 1, count: 2 }, { level: 2, count: 1 }] }] });

    expect(res.status).toBe(200);
    expect(slot(res.body, 1)!.used).toBe(0);
    expect(slot(res.body, 2)!.used).toBe(2);
    expect(pool(res.body, "arcaneRecovery")!.used).toBe(1);
    expect(pool(res.body, "arcaneRecovery")!.remaining).toBe(0);
  });

  it("rejects a second Arcane Recovery before a long rest; a long rest refreshes it", async () => {
    const first = await supertest(app).post(url(WIZARD_ID)).set("Cookie", COOKIE)
      .send({ operations: [{ type: "arcaneRecovery", slots: [{ level: 2, count: 1 }] }] });
    expect(first.status).toBe(200);

    const second = await supertest(app).post(url(WIZARD_ID)).set("Cookie", COOKIE)
      .send({ operations: [{ type: "arcaneRecovery", slots: [{ level: 1, count: 1 }] }] });
    expect(second.status).toBe(400);

    const rest = await supertest(app).post(`/api/characters/${WIZARD_ID}/hp`).set("Cookie", COOKIE)
      .send({ operations: [{ type: "longRest" }] });
    expect(rest.status).toBe(200);
    expect(pool(rest.body, "arcaneRecovery")!.used).toBe(0);

    await supertest(app).post(url(WIZARD_ID)).set("Cookie", COOKIE).send({ operations: [{ type: "expendSlot", level: 2 }] });
    const third = await supertest(app).post(url(WIZARD_ID)).set("Cookie", COOKIE)
      .send({ operations: [{ type: "arcaneRecovery", slots: [{ level: 2, count: 1 }] }] });
    expect(third.status).toBe(200);
    expect(pool(third.body, "arcaneRecovery")!.used).toBe(1);
  });

  it("rejects recovering more than ceil(wizardLevel/2) total slot-levels", async () => {
    const res = await supertest(app).post(url(WIZARD_ID)).set("Cookie", COOKIE)
      .send({ operations: [{ type: "arcaneRecovery", slots: [{ level: 2, count: 3 }] }] });
    expect(res.status).toBe(400);
    const check = await supertest(app).get(`/api/characters/${WIZARD_ID}`).set("Cookie", COOKIE);
    expect(pool(check.body, "arcaneRecovery")!.used).toBe(0);
  });

  it("rejects recovering any slot above 5th level", async () => {
    const res = await supertest(app).post(url(WIZARD_ID)).set("Cookie", COOKIE)
      .send({ operations: [{ type: "arcaneRecovery", slots: [{ level: 6, count: 1 }] }] });
    expect(res.status).toBe(400);
  });

  it("rejects recovering more slots than are expended at a level", async () => {
    const res = await supertest(app).post(url(WIZARD_ID)).set("Cookie", COOKIE)
      .send({ operations: [{ type: "arcaneRecovery", slots: [{ level: 3, count: 2 }] }] });
    expect(res.status).toBe(400);
  });

  it("aggregates duplicate-level entries so they cannot over-recover past expended", async () => {
    const res = await supertest(app).post(url(WIZARD_ID)).set("Cookie", COOKIE)
      .send({ operations: [{ type: "arcaneRecovery", slots: [{ level: 1, count: 2 }, { level: 1, count: 1 }] }] });
    expect(res.status).toBe(400);
    const check = await supertest(app).get(`/api/characters/${WIZARD_ID}`).set("Cookie", COOKIE);
    expect(slot(check.body, 1)!.used).toBe(2);
    expect(pool(check.body, "arcaneRecovery")!.used).toBe(0);
  });

  it("applies valid duplicate-level entries once (aggregated, no double-decrement)", async () => {
    const res = await supertest(app).post(url(WIZARD_ID)).set("Cookie", COOKIE)
      .send({ operations: [{ type: "arcaneRecovery", slots: [{ level: 1, count: 1 }, { level: 1, count: 1 }] }] });
    expect(res.status).toBe(200);
    expect(slot(res.body, 1)!.used).toBe(0);
    expect(pool(res.body, "arcaneRecovery")!.used).toBe(1);
  });

  it("rejects Arcane Recovery for a non-wizard", async () => {
    const res = await supertest(app).post(url(FIGHTER_ID)).set("Cookie", COOKIE)
      .send({ operations: [{ type: "arcaneRecovery", slots: [{ level: 1, count: 1 }] }] });
    expect(res.status).toBe(400);
  });

  it("is audited and undoable — undo restores prior slotsUsed and the recovery-use counter", async () => {
    const rec = await supertest(app).post(url(WIZARD_ID)).set("Cookie", COOKIE)
      .send({ operations: [{ type: "arcaneRecovery", slots: [{ level: 2, count: 2 }] }] });
    expect(rec.status).toBe(200);
    expect(slot(rec.body, 2)!.used).toBe(1);
    expect(pool(rec.body, "arcaneRecovery")!.used).toBe(1);

    const activity = await supertest(app).get(`/api/characters/${WIZARD_ID}/activity`).set("Cookie", COOKIE);
    const ev = (activity.body as Array<{ summary: string; reverted: boolean; batchId?: string }>)
      .find((e) => e.summary.includes("Arcane Recovery") && !e.reverted)!;
    expect(ev).toBeDefined();

    const undo = await supertest(app).post(`/api/characters/${WIZARD_ID}/events/${ev.batchId}/revert`).set("Cookie", COOKIE);
    expect(undo.status).toBe(200);
    expect(slot(undo.body, 2)!.used).toBe(3);
    expect(pool(undo.body, "arcaneRecovery")!.used).toBe(0);
  });
});
