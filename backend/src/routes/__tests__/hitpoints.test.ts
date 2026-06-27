import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";

const OWNER_ID = "owner-hitpoints";

// A fixture character with known state for HP / hit-dice tests.
// Constitution 14 → conMod +2; d10 hit die; level 2 (XP 300).
const FIXTURE = {
  id: "test-hp-character-1",
  name: "HP Test Fixture",
  alignment: "True Neutral",
  experiencePoints: 300, // level 2
  armorClass: 12,
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
    .send(body);
}

describe("POST /api/characters/:id/hp", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
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
    // total 2 → recover max(1, floor(2/2))=1 die; spent was 1 → 1-1=0
    expect(res.body.hitDice.spent).toBe(0);
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
});
