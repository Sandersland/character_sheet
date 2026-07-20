import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-hitpoints";
let COOKIE: string;

// A fixture character with known state for HP / hit-dice tests.
// Constitution 14 → conMod +2; d10 hit die; level 2 (XP 300).
const FIXTURE = {
  id: "test-hp-character-1",
  name: "HP Test Fixture",
  alignment: "True Neutral",
  experiencePoints: 300, // level 2
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 20, max: 22, temp: 5, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 2, die: "d10", spent: 0 },
  abilityScores: {
    strength: 10,
    dexterity: 12,
    constitution: 14, // +2 conMod
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

// A second fixture for "negative Con" edge cases — Con 6 → conMod -2.
const FIXTURE_LOW_CON = {
  ...FIXTURE,
  id: "test-hp-character-2",
  name: "Low-Con HP Fixture",
  abilityScores: { ...FIXTURE.abilityScores, constitution: 6 }, // -2 conMod
};

const app = createApp();

async function post(characterId: string, body: object) {
  return supertest(app)
    .post(`/api/characters/${characterId}/hp`)
    .set("Cookie", COOKIE)
    .send(body);
}

describe("POST /api/characters/:id/hp", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await prisma.character.create({ data: { ...FIXTURE, ownerId: OWNER_ID, spellcasting: Prisma.JsonNull } });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({
      where: { id: { in: [FIXTURE.id, FIXTURE_LOW_CON.id] } },
    });
  });

  it("404s for an unknown character", async () => {
    const res = await post("does-not-exist", {
      operations: [{ type: "damage", amount: 5 }],
    });
    expect(res.status).toBe(404);
  });

  it("400s on a malformed body (unknown op type)", async () => {
    const res = await post(FIXTURE.id, {
      operations: [{ type: "notARealType" }],
    });
    expect(res.status).toBe(400);
  });

  it("400s on an empty operations array", async () => {
    const res = await post(FIXTURE.id, { operations: [] });
    expect(res.status).toBe(400);
  });

  // ── damage ──────────────────────────────────────────────────────────────

  it("damage: temp absorbs before current", async () => {
    // start: temp 5, current 20, max 22
    const res = await post(FIXTURE.id, { operations: [{ type: "damage", amount: 8 }] });
    expect(res.status).toBe(200);
    // 5 temp absorbed; 3 from current: 20 - 3 = 17
    expect(res.body.hitPoints.temp).toBe(0);
    expect(res.body.hitPoints.current).toBe(17);
  });

  it("damage: floors current at 0 (not negative)", async () => {
    const res = await post(FIXTURE.id, {
      operations: [{ type: "damage", amount: 999 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(0);
    expect(res.body.hitPoints.temp).toBe(0);
  });

  it("damage: 400s when amount is 0", async () => {
    const res = await post(FIXTURE.id, { operations: [{ type: "damage", amount: 0 }] });
    expect(res.status).toBe(400);
  });

  // ── heal ─────────────────────────────────────────────────────────────────

  it("heal: adds to current, caps at max", async () => {
    // current 20, max 22
    const res = await post(FIXTURE.id, { operations: [{ type: "heal", amount: 10 }] });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(22); // capped
  });

  it("heal: at 0 HP resets death saves", async () => {
    // First damage to 0
    await post(FIXTURE.id, { operations: [{ type: "damage", amount: 999 }] });
    // Roll a death save so it's non-zero
    await post(FIXTURE.id, { operations: [{ type: "deathSave", roll: 5 }] }); // failure
    // Now heal
    const res = await post(FIXTURE.id, { operations: [{ type: "heal", amount: 1 }] });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(1);
    expect(res.body.hitPoints.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it("heal: 400s when amount is 0", async () => {
    const res = await post(FIXTURE.id, { operations: [{ type: "heal", amount: 0 }] });
    expect(res.status).toBe(400);
  });

  // ── setTemp ──────────────────────────────────────────────────────────────

  it("setTemp: takes the higher (5e no-stacking rule)", async () => {
    // start: temp 5; new value 3 → stays 5
    const res1 = await post(FIXTURE.id, { operations: [{ type: "setTemp", amount: 3 }] });
    expect(res1.body.hitPoints.temp).toBe(5);
    // new value 10 → goes up to 10
    const res2 = await post(FIXTURE.id, { operations: [{ type: "setTemp", amount: 10 }] });
    expect(res2.body.hitPoints.temp).toBe(10);
  });

  it("setTemp: 400s when amount is negative", async () => {
    const res = await post(FIXTURE.id, { operations: [{ type: "setTemp", amount: -1 }] });
    expect(res.status).toBe(400);
  });

  // ── shortRest ────────────────────────────────────────────────────────────

  it("shortRest: heals by roll+conMod for each die, increments spent", async () => {
    // conMod +2; rolls [5, 8]: gain = (5+2)=7 + (8+2)=10 = 17; but current (20)+17>22 → caps at 22
    const res = await post(FIXTURE.id, { operations: [{ type: "shortRest", rolls: [5, 8] }] });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(22); // capped at max
    expect(res.body.hitDice.spent).toBe(2);
  });

  it("shortRest: 400s when spending more dice than available", async () => {
    // total 2, spent 0 → available 2; try spending 3
    const res = await post(FIXTURE.id, {
      operations: [{ type: "shortRest", rolls: [5, 5, 5] }],
    });
    expect(res.status).toBe(400);
  });

  it("shortRest: 400s when a roll is out of range (> faces)", async () => {
    // d10 → valid range 1..10; roll of 11 is invalid
    const res = await post(FIXTURE.id, {
      operations: [{ type: "shortRest", rolls: [11] }],
    });
    expect(res.status).toBe(400);
  });

  it("shortRest (low Con): floors each die's heal at 0, not negative", async () => {
    await prisma.character.create({
      data: { ...FIXTURE_LOW_CON, ownerId: OWNER_ID, spellcasting: Prisma.JsonNull },
    });
    // conMod -2; rolls [1]: gain = max(0, 1-2) = 0; current stays 20
    const res = await post(FIXTURE_LOW_CON.id, {
      operations: [{ type: "shortRest", rolls: [1] }],
    });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(20); // unchanged
    expect(res.body.hitDice.spent).toBe(1); // die still spent
  });

  // ── longRest ─────────────────────────────────────────────────────────────

  it("longRest: restores full HP, clears temp, resets death saves, recovers dice", async () => {
    // First spend a die and deal damage
    await post(FIXTURE.id, { operations: [{ type: "shortRest", rolls: [3] }] });
    await post(FIXTURE.id, { operations: [{ type: "damage", amount: 15 }] });
    // Now long rest
    const res = await post(FIXTURE.id, { operations: [{ type: "longRest" }] });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(res.body.hitPoints.max);
    expect(res.body.hitPoints.temp).toBe(0);
    expect(res.body.hitPoints.deathSaves).toEqual({ successes: 0, failures: 0 });
    // total 2 → recover max(1, ceil(2/2))=1 die; spent was 1 → 1-1=0
    expect(res.body.hitDice.spent).toBe(0);
  });

  it.each([
    { total: 1, spent: 1, after: 0 },
    { total: 3, spent: 3, after: 1 },
    { total: 5, spent: 5, after: 2 },
  ])("longRest: recovers ceil(total/2) hit dice, min 1 (total=$total)", async ({ total, spent, after }) => {
    await prisma.character.update({
      where: { id: FIXTURE.id },
      data: { hitDice: { total, die: "d10", spent } },
    });
    const res = await post(FIXTURE.id, { operations: [{ type: "longRest" }] });
    expect(res.status).toBe(200);
    expect(res.body.hitDice.spent).toBe(after);
  });

  it("longRest: removes exactly 1 exhaustion level (#1136)", async () => {
    await prisma.character.update({
      where: { id: FIXTURE.id },
      data: { conditions: { active: [], exhaustion: 3 } },
    });
    const res = await post(FIXTURE.id, { operations: [{ type: "longRest" }] });
    expect(res.status).toBe(200);
    expect(res.body.conditions.exhaustion).toBe(2);
  });

  it("longRest: leaves exhaustion 0 untouched (no decrement below 0) (#1136)", async () => {
    const res = await post(FIXTURE.id, { operations: [{ type: "longRest" }] });
    expect(res.status).toBe(200);
    expect(res.body.conditions.exhaustion).toBe(0);
    // No exhaustion part in the long-rest summary.
    const activity = await supertest(app).get(`/api/characters/${FIXTURE.id}/activity`).set("Cookie", COOKIE);
    const ev = (activity.body as Array<{ type: string; summary: string }>).find((e) => e.type === "longRest")!;
    expect(ev.summary).not.toMatch(/[Ee]xhaustion/);
  });

  it("longRest → undo restores the exhaustion level cleared by the rest (#1136)", async () => {
    await prisma.character.update({
      where: { id: FIXTURE.id },
      data: { conditions: { active: [], exhaustion: 3 } },
    });
    await post(FIXTURE.id, { operations: [{ type: "longRest" }] });
    const activity = await supertest(app).get(`/api/characters/${FIXTURE.id}/activity`).set("Cookie", COOKIE);
    const ev = (activity.body as Array<{ type: string; reverted: boolean; batchId?: string; summary: string }>)
      .find((e) => e.type === "longRest" && !e.reverted)!;
    expect(ev.summary).toMatch(/Exhaustion −1 \(now 2\)/);

    const undo = await supertest(app).post(`/api/characters/${FIXTURE.id}/events/${ev.batchId}/revert`).set("Cookie", COOKIE);
    expect(undo.status).toBe(200);
    expect(undo.body.conditions.exhaustion).toBe(3);
  });

  // ── levelUp ──────────────────────────────────────────────────────────────

  it("levelUp (average): increments total, bumps max+current by fixed average+conMod", async () => {
    // XP=300 → level 2; hitDice.total=2 → pendingLevelUps=0 normally.
    // Give the character XP for level 3 to create a pending level-up.
    await prisma.character.update({
      where: { id: FIXTURE.id },
      data: { experiencePoints: 900 }, // level 3
    });
    const res = await post(FIXTURE.id, {
      operations: [{ type: "levelUp", method: "average" }],
    });
    expect(res.status).toBe(200);
    // d10 average = floor(10/2)+1 = 6; +2 conMod → gain 8
    expect(res.body.hitDice.total).toBe(3);
    expect(res.body.hitPoints.max).toBe(FIXTURE.hitPoints.max + 8);
    expect(res.body.hitPoints.current).toBe(FIXTURE.hitPoints.current + 8);
    expect(res.body.pendingLevelUps).toBe(0);
  });

  it("levelUp (roll): validates the raw die value and applies it server-side", async () => {
    await prisma.character.update({
      where: { id: FIXTURE.id },
      data: { experiencePoints: 900 },
    });
    // roll = 7; gain = max(1, 7+2) = 9
    const res = await post(FIXTURE.id, {
      operations: [{ type: "levelUp", method: "roll", roll: 7 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.max).toBe(FIXTURE.hitPoints.max + 9);
  });

  it("levelUp: 400s when roll is out of die range", async () => {
    await prisma.character.update({
      where: { id: FIXTURE.id },
      data: { experiencePoints: 900 },
    });
    const res = await post(FIXTURE.id, {
      operations: [{ type: "levelUp", method: "roll", roll: 11 }], // d10 max is 10
    });
    expect(res.status).toBe(400);
  });

  it("levelUp: 400s when no level-up is pending (hitDice.total >= derivedLevel)", async () => {
    // XP=300 → level 2; total=2 → no pending
    const res = await post(FIXTURE.id, {
      operations: [{ type: "levelUp", method: "average" }],
    });
    expect(res.status).toBe(400);
  });

  it("levelUp: repairs classEntries[0].level to match new total", async () => {
    await prisma.character.update({
      where: { id: FIXTURE.id },
      data: { experiencePoints: 900 },
    });
    const res = await post(FIXTURE.id, {
      operations: [{ type: "levelUp", method: "average" }],
    });
    expect(res.status).toBe(200);
    // The classes array in the serialized character should reflect the repaired level
    const primaryClass = res.body.classes?.[0];
    if (primaryClass) {
      expect(primaryClass.level).toBe(3);
    }
  });

  // ── deathSave ────────────────────────────────────────────────────────────

  it("deathSave: 400s when not at 0 HP", async () => {
    // current is 20 (not 0)
    const res = await post(FIXTURE.id, { operations: [{ type: "deathSave", roll: 10 }] });
    expect(res.status).toBe(400);
  });

  it("deathSave: 1 → +2 failures", async () => {
    await post(FIXTURE.id, { operations: [{ type: "damage", amount: 999 }] });
    const res = await post(FIXTURE.id, { operations: [{ type: "deathSave", roll: 1 }] });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.deathSaves.failures).toBe(2);
  });

  it("deathSave: 2–9 → +1 failure", async () => {
    await post(FIXTURE.id, { operations: [{ type: "damage", amount: 999 }] });
    const res = await post(FIXTURE.id, { operations: [{ type: "deathSave", roll: 7 }] });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.deathSaves.failures).toBe(1);
    expect(res.body.hitPoints.current).toBe(0);
  });

  it("deathSave: 10–19 → +1 success", async () => {
    await post(FIXTURE.id, { operations: [{ type: "damage", amount: 999 }] });
    const res = await post(FIXTURE.id, { operations: [{ type: "deathSave", roll: 15 }] });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.deathSaves.successes).toBe(1);
  });

  it("deathSave: 20 → regain 1 HP + reset saves", async () => {
    await post(FIXTURE.id, { operations: [{ type: "damage", amount: 999 }] });
    const res = await post(FIXTURE.id, { operations: [{ type: "deathSave", roll: 20 }] });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(1);
    expect(res.body.hitPoints.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it("deathSave: 3 successes → stable (saves reset, still 0 HP)", async () => {
    await post(FIXTURE.id, { operations: [{ type: "damage", amount: 999 }] });
    await post(FIXTURE.id, { operations: [{ type: "deathSave", roll: 15 }] }); // 1 success
    await post(FIXTURE.id, { operations: [{ type: "deathSave", roll: 12 }] }); // 2 successes
    const res = await post(FIXTURE.id, { operations: [{ type: "deathSave", roll: 10 }] }); // 3 → stable
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(0);
    expect(res.body.hitPoints.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  // ── stabilize ────────────────────────────────────────────────────────────

  it("stabilize: resets death saves while leaving current at 0", async () => {
    await post(FIXTURE.id, { operations: [{ type: "damage", amount: 999 }] });
    await post(FIXTURE.id, { operations: [{ type: "deathSave", roll: 5 }] }); // 1 failure
    const res = await post(FIXTURE.id, { operations: [{ type: "stabilize" }] });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(0);
    expect(res.body.hitPoints.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it("stabilize: 400s when not at 0 HP", async () => {
    const res = await post(FIXTURE.id, { operations: [{ type: "stabilize" }] });
    expect(res.status).toBe(400);
  });

  // ── response shape ───────────────────────────────────────────────────────

  it("returns the full updated Character on success", async () => {
    const res = await post(FIXTURE.id, { operations: [{ type: "damage", amount: 1 }] });
    expect(res.status).toBe(200);
    // Spot-check the full shape
    expect(res.body).toHaveProperty("id", FIXTURE.id);
    expect(res.body).toHaveProperty("hitPoints");
    expect(res.body).toHaveProperty("hitDice");
    expect(res.body).toHaveProperty("pendingLevelUps");
    expect(res.body.hitPoints).toHaveProperty("deathSaves");
    expect(res.body.hitDice).toHaveProperty("spent");
  });

  // ── batch visibility ──────────────────────────────────────────────────────

  it("multi-op batch: op 2 sees op 1's persisted HP", async () => {
    // start: temp 5, current 20, max 22. damage 8 → temp 0, current 17;
    // heal 4 operates on 17 → 21 (a stale re-read of current 20 would cap at 22).
    const res = await post(FIXTURE.id, {
      operations: [
        { type: "damage", amount: 8 },
        { type: "heal", amount: 4 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.temp).toBe(0);
    expect(res.body.hitPoints.current).toBe(21);
  });
});

// ── rest undo preserves resource sub-fields (issue #319) ────────────────────

const FS_OWNER_ID = "owner-hitpoints-rest-undo";
const BM_FIXTURE_ID = "test-hp-rest-undo-fighter";
const BM_CATALOG_NAME = "HP Rest Undo Battle Master";

// Level-4 Battle Master Fighter: Fighting Style feat (L1), 1 ASI (L4), 3 maneuvers
// (L3), Student-of-War tool (L3) and a 4×d8 superiority pool all entitled, so
// serializeCharacter's clamp-on-read keeps every stored sub-field.
const BM_RESOURCES = {
  used: { superiorityDice: 3 },
  maneuversKnown: [{ id: "mv-1", name: "Trip Attack" }],
  toolProficienciesKnown: [{ id: "tp-1", name: "Smith's Tools" }],
  advancements: [
    { id: "adv-1", level: 4, kind: "asi", abilityDeltas: { strength: 2 }, hpDelta: 0, initDelta: 0 },
    { id: "adv-fs", level: 1, kind: "feat", slot: "fightingStyle", abilityDeltas: {}, hpDelta: 0, initDelta: 0, featName: "Defense", featDescription: "d", improvements: [{ target: "armorClassWhileArmored", amount: 1 }] },
  ],
};

const BM_FIXTURE = {
  id: BM_FIXTURE_ID,
  name: "Rest Undo Battle Master",
  alignment: "Lawful Neutral",
  experiencePoints: 2700, // level 4
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 20, max: 36, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 4, die: "d10", spent: 0 },
  abilityScores: { strength: 16, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: ["strength", "constitution"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

describe("POST /api/characters/:id/hp — rest undo preserves resource sub-fields", () => {
  let bmCookie: string;

  async function bmPost(body: object) {
    return supertest(app).post(`/api/characters/${BM_FIXTURE_ID}/hp`).set("Cookie", bmCookie).send(body);
  }

  async function restEvent(type: string) {
    const res = await supertest(app)
      .get(`/api/characters/${BM_FIXTURE_ID}/activity?category=hitPoints`)
      .set("Cookie", bmCookie);
    return (res.body as Array<{ type: string; batchId?: string; before?: { resources?: { used?: Record<string, number> } }; after?: { resources?: { used?: Record<string, number> } } }>)
      .find((e) => e.type === type)!;
  }

  async function revert(batchId: string) {
    return supertest(app)
      .post(`/api/characters/${BM_FIXTURE_ID}/events/${batchId}/revert`)
      .set("Cookie", bmCookie);
  }

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: BM_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(FS_OWNER_ID);
    bmCookie = await authCookie(FS_OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: BM_CATALOG_NAME },
      create: {
        name: BM_CATALOG_NAME,
        hitDie: "d10",
        savingThrows: ["strength", "constitution"],
        skillChoiceCount: 2,
        skillChoices: ["athletics", "intimidation"],
        isSpellcaster: false,
      },
      update: {},
    });
    await prisma.character.create({
      data: {
        ...BM_FIXTURE,
        ownerId: FS_OWNER_ID,
        spellcasting: Prisma.JsonNull,
        resources: BM_RESOURCES as unknown as Prisma.InputJsonValue,
        classEntries: { create: [{ name: "fighter", subclass: "battle master", classId: cls.id, position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: BM_FIXTURE_ID } });
  });

  function assertSubFieldsIntact(body: { resources: { maneuversKnown: Array<{ name: string }>; toolProficienciesKnown: Array<{ name: string }> }; advancements: Array<{ slot?: string; featName?: string; abilityDeltas: Record<string, number> }> }) {
    expect(body.resources.maneuversKnown.map((m) => m.name)).toContain("Trip Attack");
    expect(body.resources.toolProficienciesKnown.map((t) => t.name)).toContain("Smith's Tools");
    // Both the ASI and the Fighting Style feat survive the rest-undo snapshot (#818/#1137).
    expect(body.advancements).toHaveLength(2);
    expect(body.advancements.find((a) => a.slot !== "fightingStyle")?.abilityDeltas).toEqual({ strength: 2 });
    expect(body.advancements.some((a) => a.slot === "fightingStyle" && a.featName === "Defense")).toBe(true);
  }

  it("short rest → undo retains the fs feat, advancements and toolProficienciesKnown", async () => {
    const rest = await bmPost({ operations: [{ type: "shortRest", rolls: [4] }] });
    expect(rest.status).toBe(200);

    const ev = await restEvent("shortRest");
    const undo = await revert(ev.batchId!);
    expect(undo.status).toBe(200);
    assertSubFieldsIntact(undo.body);
    // The spent superiority die is re-expended by the undo.
    expect(undo.body.resources.pools.find((p: { key: string }) => p.key === "superiorityDice").used).toBe(3);
  });

  it("long rest → undo retains the fs feat, advancements and toolProficienciesKnown", async () => {
    const rest = await bmPost({ operations: [{ type: "longRest" }] });
    expect(rest.status).toBe(200);

    const ev = await restEvent("longRest");
    const undo = await revert(ev.batchId!);
    expect(undo.status).toBe(200);
    assertSubFieldsIntact(undo.body);
    expect(undo.body.resources.pools.find((p: { key: string }) => p.key === "superiorityDice").used).toBe(3);
  });

  it("long-rest audit event's after.resources ≠ before.resources when pools were restored", async () => {
    const rest = await bmPost({ operations: [{ type: "longRest" }] });
    expect(rest.status).toBe(200);

    const ev = await restEvent("longRest");
    expect(ev.before!.resources!.used).toEqual({ superiorityDice: 3 });
    expect(ev.after!.resources!.used).toEqual({ superiorityDice: 0 });
    expect(ev.after!.resources).not.toEqual(ev.before!.resources);
  });
});
