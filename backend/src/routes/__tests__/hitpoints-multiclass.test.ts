import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";
import { authCookie } from "../../test-support/auth.js";

const OWNER_ID = "owner-mc-levelup";
const CHAR_ID = "test-mc-levelup-1";
const FIGHTER = "MC Level Fighter";
// Canonical name so the srd multiclass-prerequisite validator (keyed by class
// name) applies. Non-destructive upsert (update:{}) leaves any seeded row alone.
const WIZARD = "Wizard";
let COOKIE: string;
let fighterId: string;
let wizardId: string;
let fighterEntryId: string;

const app = createApp();

async function hp(body: object) {
  return supertest(app).post(`/api/characters/${CHAR_ID}/hp`).set("Cookie", COOKIE).send(body);
}
async function xp(body: object) {
  return supertest(app).post(`/api/characters/${CHAR_ID}/experience`).set("Cookie", COOKIE).send(body);
}

// Level 5 (XP 6500) but only 4 HP level-ups applied → exactly one pending.
// Con 14 (+2), Str 15 (Fighter), Int 13 (meets Wizard multiclass prereq).
const BASE = {
  id: CHAR_ID,
  name: "MC Level Fixture",
  alignment: "True Neutral",
  experiencePoints: 6500,
  armorClass: 16,
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 4, die: "d10", spent: 0 },
  abilityScores: {
    strength: 15,
    dexterity: 12,
    constitution: 14,
    intelligence: 13,
    wisdom: 10,
    charisma: 10,
  },
  savingThrowProficiencies: ["strength", "constitution"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

describe("POST /api/characters/:id/hp — level-up class allocation (#124)", () => {
  afterAll(async () => {
    // Only remove the custom Fighter; WIZARD is the shared canonical catalog row.
    await prisma.characterClass.deleteMany({ where: { name: FIGHTER } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const f = await prisma.characterClass.upsert({
      where: { name: FIGHTER },
      create: {
        name: FIGHTER,
        hitDie: "d10",
        savingThrows: ["strength", "constitution"],
        skillChoiceCount: 2,
        skillChoices: ["athletics"],
        isSpellcaster: false,
      },
      update: {},
    });
    const w = await prisma.characterClass.upsert({
      where: { name: WIZARD },
      create: {
        name: WIZARD,
        hitDie: "d6",
        savingThrows: ["intelligence", "wisdom"],
        skillChoiceCount: 2,
        skillChoices: ["arcana"],
        isSpellcaster: true,
      },
      update: {},
    });
    fighterId = f.id;
    wizardId = w.id;

    const char = await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [{ name: FIGHTER, classId: fighterId, position: 0, level: 4 }] },
      },
      include: { classEntries: true },
    });
    fighterEntryId = char.classEntries[0].id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: CHAR_ID } });
  });

  it("advances an EXISTING class via target — entry level + HP from that class's die", async () => {
    const res = await hp({
      operations: [{ type: "levelUp", method: "average", target: { kind: "existing", classEntryId: fighterEntryId } }],
    });
    expect(res.status).toBe(200);
    expect(res.body.hitDice.total).toBe(5);
    // d10 average 6 + con 2 = 8
    expect(res.body.hitPoints.max).toBe(38);
    expect(res.body.classes).toHaveLength(1);
    expect(res.body.classes[0].name).toBe(FIGHTER);
    expect(res.body.classes[0].level).toBe(5);
  });

  it("no target still self-heals position-0 (backward compatible)", async () => {
    const res = await hp({ operations: [{ type: "levelUp", method: "average" }] });
    expect(res.status).toBe(200);
    expect(res.body.hitDice.total).toBe(5);
    expect(res.body.hitPoints.max).toBe(38); // d10 die from hd.die
    expect(res.body.classes[0].level).toBe(5);
  });

  it("adds a NEW class via target — creates a 2nd entry, HP from the new class's die", async () => {
    const res = await hp({
      operations: [{ type: "levelUp", method: "average", target: { kind: "new", classId: wizardId } }],
    });
    expect(res.status).toBe(200);
    expect(res.body.hitDice.total).toBe(5);
    // d6 average 4 + con 2 = 6
    expect(res.body.hitPoints.max).toBe(36);
    expect(res.body.classes).toHaveLength(2);
    expect(res.body.classes.find((c: { name: string }) => c.name === FIGHTER).level).toBe(4);
    expect(res.body.classes.find((c: { name: string }) => c.name === WIZARD).level).toBe(1);
  });

  it("rejects a NEW class when 5e ability prerequisites are unmet", async () => {
    await prisma.character.update({
      where: { id: CHAR_ID },
      data: { abilityScores: { ...BASE.abilityScores, intelligence: 12 } },
    });
    const res = await hp({
      operations: [{ type: "levelUp", method: "average", target: { kind: "new", classId: wizardId } }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Intelligence 13/);
  });

  it("rejects a NEW class the character already has", async () => {
    const res = await hp({
      operations: [{ type: "levelUp", method: "average", target: { kind: "new", classId: fighterId } }],
    });
    expect(res.status).toBe(400);
  });

  it("level-down reconciles per-class through the registry — trims the newest class", async () => {
    const up = await hp({
      operations: [{ type: "levelUp", method: "average", target: { kind: "new", classId: wizardId } }],
    });
    expect(up.status).toBe(200);
    expect(up.body.classes).toHaveLength(2);

    // Drop XP to level 4 (2700) → the Wizard entry (highest position) is removed.
    const down = await xp({ operations: [{ type: "set", value: 2700 }] });
    expect(down.status).toBe(200);
    expect(down.body.level).toBe(4);
    expect(down.body.classes).toHaveLength(1);
    expect(down.body.classes[0].name).toBe(FIGHTER);
    expect(down.body.classes[0].level).toBe(4);
    expect(down.body.hitPoints.max).toBe(30); // Wizard's +6 HP reversed

    const entries = await prisma.characterClassEntry.findMany({ where: { characterId: CHAR_ID } });
    expect(entries).toHaveLength(1);
  });

  it("level-down round-trip — undo restores the reconciled multiclass split", async () => {
    await hp({ operations: [{ type: "levelUp", method: "average", target: { kind: "new", classId: wizardId } }] });
    const down = await xp({ operations: [{ type: "set", value: 2700 }] });
    expect(down.status).toBe(200);
    expect(down.body.classes).toHaveLength(1);

    const activity = await supertest(app)
      .get(`/api/characters/${CHAR_ID}/activity`)
      .set("Cookie", COOKIE);
    const batchId = (activity.body as { batchId: string }[])[0].batchId;

    const res = await supertest(app)
      .post(`/api/characters/${CHAR_ID}/events/${batchId}/revert`)
      .set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.level).toBe(5);
    expect(res.body.classes).toHaveLength(2);
    expect(res.body.classes.find((c: { name: string }) => c.name === WIZARD).level).toBe(1);
    expect(res.body.classes.find((c: { name: string }) => c.name === FIGHTER).level).toBe(4);
  });

  it("undo of a NEW-class level-up deletes the created entry (no ghost class)", async () => {
    const up = await hp({
      operations: [{ type: "levelUp", method: "average", target: { kind: "new", classId: wizardId } }],
    });
    expect(up.status).toBe(200);
    expect(up.body.classes).toHaveLength(2);

    const activity = await supertest(app)
      .get(`/api/characters/${CHAR_ID}/activity`)
      .set("Cookie", COOKIE);
    const batchId = (activity.body as { batchId: string }[])[0].batchId;

    const res = await supertest(app)
      .post(`/api/characters/${CHAR_ID}/events/${batchId}/revert`)
      .set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.max).toBe(30); // Wizard's +6 HP reversed
    expect(res.body.classes).toHaveLength(1);
    expect(res.body.classes[0].name).toBe(FIGHTER);

    // The created Wizard entry must be gone from the DB, not just clamped on read.
    const entries = await prisma.characterClassEntry.findMany({ where: { characterId: CHAR_ID } });
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe(FIGHTER);
  });

  it("rejects a no-target level-up once the character is multiclass", async () => {
    const up = await hp({
      operations: [{ type: "levelUp", method: "average", target: { kind: "new", classId: wizardId } }],
    });
    expect(up.status).toBe(200);
    expect(up.body.classes).toHaveLength(2);

    // Grant another pending level (XP 14000 = level 6) so the op reaches the
    // level-up handler rather than being short-circuited as "no pending level".
    const bump = await xp({ operations: [{ type: "set", value: 14000 }] });
    expect(bump.status).toBe(200);

    const res = await hp({ operations: [{ type: "levelUp", method: "average" }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/multiclass|target/i);
  });
});
