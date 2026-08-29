import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-concentration";
let COOKIE: string;

const CONC = {
  entryId: "fixture-conc-entry",
  spellName: "Fixture Bless",
};

const SPELLCASTING_JSON = {
  slotsUsed: {},
  arcanumUsed: {},
  spells: [
    {
      id: CONC.entryId,
      name: CONC.spellName,
      level: 1,
      school: "enchantment",
      prepared: true,
      castingTime: "1 action",
      range: "30 ft",
      duration: "Concentration, up to 1 minute",
      description: "Bless up to three creatures.",
      concentration: true,
    },
  ],
  concentratingOn: { ...CONC },
};

const FIXTURE = {
  id: "test-concentration-character-1",
  name: "Concentration Test Fixture",
  alignment: "True Neutral",
  experiencePoints: 300,
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 200, max: 200, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 2, die: "d10", spent: 0 },
  abilityScores: {
    strength: 10,
    dexterity: 12,
    constitution: 10, // worst case for the save
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

const FIXTURE_HIGH_CON = {
  ...FIXTURE,
  id: "test-concentration-character-2",
  name: "High-CON Concentration Fixture",
  abilityScores: { ...FIXTURE.abilityScores, constitution: 28 },
};

async function post(characterId: string, body: object) {
  return supertest(app).post(`/api/characters/${characterId}/hp`).set("Cookie", COOKIE).send(body);
}

async function getSpellcasting(id: string): Promise<Record<string, unknown>> {
  const row = await prisma.character.findUnique({
    where: { id },
    select: { spellcasting: true },
  });
  return (row?.spellcasting ?? {}) as Record<string, unknown>;
}

describe("Concentration on damage (issue #41)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await prisma.character.create({
      data: { ...FIXTURE, ownerId: OWNER_ID, spellcasting: SPELLCASTING_JSON as Prisma.InputJsonValue },
    });
    await prisma.character.create({
      data: { ...FIXTURE_HIGH_CON, ownerId: OWNER_ID, spellcasting: SPELLCASTING_JSON as Prisma.InputJsonValue },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({
      where: { id: { in: [FIXTURE.id, FIXTURE_HIGH_CON.id] } },
    });
  });

  it("failed save drops concentration and returns a 'damage' check", async () => {
    const res = await post(FIXTURE.id, { operations: [{ type: "damage", amount: 150 }] });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(50);

    expect(res.body.concentrationChecks).toHaveLength(1);
    const check = res.body.concentrationChecks[0];
    expect(check.reason).toBe("damage");
    expect(check.held).toBe(false);
    expect(check.dc).toBe(75);
    expect(check.damage).toBe(150);
    expect(check.saveBonus).toBe(0);
    expect(check.total).toBeLessThan(check.dc);

    const sc = await getSpellcasting(FIXTURE.id);
    expect(sc.concentratingOn).toBeNull();
  });

  it("logs a concentrationDropped event with reason 'damage' on a failed save", async () => {
    await post(FIXTURE.id, { operations: [{ type: "damage", amount: 150 }] });

    const events = await prisma.characterEvent.findMany({
      where: { characterId: FIXTURE.id, type: "concentrationDropped" },
    });
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.category).toBe("spellcasting");
    const data = ev.data as Record<string, unknown>;
    expect(data.reason).toBe("damage");
    expect(data.droppedSpellName).toBe(CONC.spellName);
    expect(typeof data.roll).toBe("number");
    expect(data.dc).toBe(75);
    // Event must carry before/after spellcasting so the spellcasting revert works.
    const before = ev.before as Record<string, unknown>;
    const after = ev.after as Record<string, unknown>;
    expect((before.spellcasting as Record<string, unknown>).concentratingOn).not.toBeNull();
    expect((after.spellcasting as Record<string, unknown>).concentratingOn).toBeNull();
  });

  it("passed save keeps concentration and logs no drop event", async () => {
    const res = await post(FIXTURE_HIGH_CON.id, {
      operations: [{ type: "damage", amount: 10 }],
    });
    expect(res.status).toBe(200);

    expect(res.body.concentrationChecks).toHaveLength(1);
    const check = res.body.concentrationChecks[0];
    expect(check.reason).toBe("damage");
    expect(check.held).toBe(true);
    expect(check.dc).toBe(10);
    expect(check.saveBonus).toBe(9);

    const sc = await getSpellcasting(FIXTURE_HIGH_CON.id);
    expect((sc.concentratingOn as Record<string, unknown>)?.spellName).toBe(CONC.spellName);

    const events = await prisma.characterEvent.findMany({
      where: { characterId: FIXTURE_HIGH_CON.id, type: "concentrationDropped" },
    });
    expect(events).toHaveLength(0);
  });

  it("DC math: 10 damage → DC 10 (max(10, …) floor, not 5)", async () => {
    const res = await post(FIXTURE_HIGH_CON.id, {
      operations: [{ type: "damage", amount: 10 }],
    });
    expect(res.body.concentrationChecks[0].dc).toBe(10);
  });

  it("DC math: 22 damage → DC 11 (floor(22/2))", async () => {
    const res = await post(FIXTURE_HIGH_CON.id, {
      operations: [{ type: "damage", amount: 22 }],
    });
    expect(res.body.concentrationChecks[0].dc).toBe(11);
  });

  it("dropping to 0 HP clears concentration with no save (reason 'death')", async () => {
    const res = await post(FIXTURE.id, { operations: [{ type: "damage", amount: 999 }] });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(0);

    expect(res.body.concentrationChecks).toHaveLength(1);
    const check = res.body.concentrationChecks[0];
    expect(check.reason).toBe("death");
    expect(check.held).toBe(false);
    expect(check.roll).toBeNull();
    expect(check.dc).toBeNull();

    const sc = await getSpellcasting(FIXTURE.id);
    expect(sc.concentratingOn).toBeNull();

    const events = await prisma.characterEvent.findMany({
      where: { characterId: FIXTURE.id, type: "concentrationDropped" },
    });
    expect(events).toHaveLength(1);
    expect((events[0].data as Record<string, unknown>).reason).toBe("death");
  });

  it("not concentrating → no check is performed", async () => {
    await prisma.character.update({
      where: { id: FIXTURE.id },
      data: {
        spellcasting: {
          slotsUsed: {},
          arcanumUsed: {},
          spells: SPELLCASTING_JSON.spells,
          concentratingOn: null,
        } as Prisma.InputJsonValue,
      },
    });
    const res = await post(FIXTURE.id, { operations: [{ type: "damage", amount: 150 }] });
    expect(res.status).toBe(200);
    expect(res.body.concentrationChecks).toHaveLength(0);
  });

  it("undo restores dropped concentration (failed save)", async () => {
    const dmg = await post(FIXTURE.id, { operations: [{ type: "damage", amount: 150 }] });
    expect(dmg.status).toBe(200);

    let sc = await getSpellcasting(FIXTURE.id);
    expect(sc.concentratingOn).toBeNull();

    // damage and its concentration check share a batchId.
    const dmgEvent = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE.id, category: "hitPoints", type: "damage" },
      orderBy: { createdAt: "desc" },
    });
    expect(dmgEvent?.batchId).toBeTruthy();

    const revert = await supertest.agent(app).set("Cookie", COOKIE).post(
      `/api/characters/${FIXTURE.id}/events/${dmgEvent!.batchId}/revert`,
    );
    expect(revert.status).toBe(200);

    expect(revert.body.hitPoints.current).toBe(200);
    sc = await getSpellcasting(FIXTURE.id);
    expect((sc.concentratingOn as Record<string, unknown>)?.spellName).toBe(CONC.spellName);
  });

  it("uses CON-save proficiency bonus when proficient", async () => {
    await prisma.character.update({
      where: { id: FIXTURE.id },
      data: { savingThrowProficiencies: ["constitution"] },
    });
    const res = await post(FIXTURE.id, { operations: [{ type: "damage", amount: 150 }] });
    expect(res.body.concentrationChecks[0].saveBonus).toBe(2);
  });

  it("auto path reports status 'resolved'", async () => {
    const res = await post(FIXTURE.id, { operations: [{ type: "damage", amount: 150 }] });
    expect(res.body.concentrationChecks[0].status).toBe("resolved");
  });
});

describe("Interactive concentration save (issue #76)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await prisma.character.create({
      data: { ...FIXTURE, ownerId: OWNER_ID, spellcasting: SPELLCASTING_JSON as Prisma.InputJsonValue },
    });
    await prisma.character.create({
      data: { ...FIXTURE_HIGH_CON, ownerId: OWNER_ID, spellcasting: SPELLCASTING_JSON as Prisma.InputJsonValue },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({
      where: { id: { in: [FIXTURE.id, FIXTURE_HIGH_CON.id] } },
    });
  });

  it("autoRollConcentration:false defers the save (pending check, no mutation/log)", async () => {
    const res = await post(FIXTURE.id, {
      operations: [{ type: "damage", amount: 30, autoRollConcentration: false }],
    });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(170);

    expect(res.body.concentrationChecks).toHaveLength(1);
    const check = res.body.concentrationChecks[0];
    expect(check.status).toBe("pending");
    expect(check.entryId).toBe(CONC.entryId);
    expect(check.dc).toBe(15);
    expect(check.saveBonus).toBe(0);
    expect(check.held).toBeNull();
    expect(check.roll).toBeNull();

    const sc = await getSpellcasting(FIXTURE.id);
    expect((sc.concentratingOn as Record<string, unknown>)?.entryId).toBe(CONC.entryId);
    const events = await prisma.characterEvent.findMany({
      where: { characterId: FIXTURE.id, type: "concentrationDropped" },
    });
    expect(events).toHaveLength(0);
  });

  it("0 HP still ends concentration with no save even when auto-roll is off", async () => {
    const res = await post(FIXTURE.id, {
      operations: [{ type: "damage", amount: 999, autoRollConcentration: false }],
    });
    expect(res.body.hitPoints.current).toBe(0);
    const check = res.body.concentrationChecks[0];
    expect(check.status).toBe("resolved");
    expect(check.reason).toBe("death");

    const sc = await getSpellcasting(FIXTURE.id);
    expect(sc.concentratingOn).toBeNull();
  });

  it("concentrationSave: failed roll drops concentration and logs the drop", async () => {
    const res = await post(FIXTURE.id, {
      operations: [{ type: "concentrationSave", entryId: CONC.entryId, roll: 1, damage: 40 }],
    });
    expect(res.status).toBe(200);
    const check = res.body.concentrationChecks[0];
    expect(check.status).toBe("resolved");
    expect(check.held).toBe(false);
    expect(check.dc).toBe(20);
    expect(check.total).toBe(1);

    const sc = await getSpellcasting(FIXTURE.id);
    expect(sc.concentratingOn).toBeNull();

    const events = await prisma.characterEvent.findMany({
      where: { characterId: FIXTURE.id, type: "concentrationDropped" },
    });
    expect(events).toHaveLength(1);
    expect((events[0].data as Record<string, unknown>).reason).toBe("damage");
  });

  it("concentrationSave: passing roll keeps concentration and logs nothing", async () => {
    const res = await post(FIXTURE.id, {
      operations: [{ type: "concentrationSave", entryId: CONC.entryId, roll: 20, damage: 10 }],
    });
    const check = res.body.concentrationChecks[0];
    expect(check.held).toBe(true);
    expect(check.dc).toBe(10);
    expect(check.total).toBe(20);

    const sc = await getSpellcasting(FIXTURE.id);
    expect((sc.concentratingOn as Record<string, unknown>)?.entryId).toBe(CONC.entryId);
    const events = await prisma.characterEvent.findMany({
      where: { characterId: FIXTURE.id, type: "concentrationDropped" },
    });
    expect(events).toHaveLength(0);
  });

  it("concentrationSave: DC is recomputed from damage (22 → 11), never trusted from the client", async () => {
    // roll 11 exactly meets DC 11 — proves the DC isn't larger.
    const res = await post(FIXTURE.id, {
      operations: [{ type: "concentrationSave", entryId: CONC.entryId, roll: 11, damage: 22 }],
    });
    expect(res.body.concentrationChecks[0].dc).toBe(11);
    expect(res.body.concentrationChecks[0].held).toBe(true);
  });

  it("concentrationSave: stale entryId is a no-op (no drop, no event)", async () => {
    const res = await post(FIXTURE.id, {
      operations: [{ type: "concentrationSave", entryId: "not-the-active-entry", roll: 1, damage: 40 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.concentrationChecks).toHaveLength(0);

    const sc = await getSpellcasting(FIXTURE.id);
    expect((sc.concentratingOn as Record<string, unknown>)?.entryId).toBe(CONC.entryId);
    const events = await prisma.characterEvent.findMany({
      where: { characterId: FIXTURE.id, type: "concentrationDropped" },
    });
    expect(events).toHaveLength(0);
  });

  it("concentrationSave: roll out of range (0 / 21) is rejected", async () => {
    const low = await post(FIXTURE.id, {
      operations: [{ type: "concentrationSave", entryId: CONC.entryId, roll: 0, damage: 10 }],
    });
    expect(low.status).toBe(400);
    const high = await post(FIXTURE.id, {
      operations: [{ type: "concentrationSave", entryId: CONC.entryId, roll: 21, damage: 10 }],
    });
    expect(high.status).toBe(400);
  });

  it("undo restores concentration dropped by a manual save", async () => {
    const save = await post(FIXTURE.id, {
      operations: [{ type: "concentrationSave", entryId: CONC.entryId, roll: 1, damage: 40 }],
    });
    expect(save.status).toBe(200);
    let sc = await getSpellcasting(FIXTURE.id);
    expect(sc.concentratingOn).toBeNull();

    const dropEvent = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE.id, type: "concentrationDropped" },
      orderBy: { createdAt: "desc" },
    });
    const revert = await supertest.agent(app).set("Cookie", COOKIE).post(
      `/api/characters/${FIXTURE.id}/events/${dropEvent!.batchId}/revert`,
    );
    expect(revert.status).toBe(200);

    sc = await getSpellcasting(FIXTURE.id);
    expect((sc.concentratingOn as Record<string, unknown>)?.entryId).toBe(CONC.entryId);
  });
});
