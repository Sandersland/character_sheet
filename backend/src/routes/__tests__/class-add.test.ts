/**
 * Add-class (multiclass) class-transaction route tests — issue #125.
 * Fixture: a level-5 Fighter (XP 6500) with only 4 HP level-ups applied → one
 * pending level, so adding a class allocates that pending level and both entries
 * fit under the XP-derived cap. Con 14 (+2), Str 15 (Fighter), Int 13 (meets the
 * Wizard multiclass prerequisite). The Wizard catalog row is the shared canonical
 * name so the srd validator (keyed by class name) applies; the Fighter catalog is
 * uniquely named so afterAll cleanup never touches a seeded row.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";
import { authCookie } from "../../test-support/auth.js";

const OWNER_ID = "owner-class-add";
const FIXTURE_ID = "test-class-add-1";
const FIGHTER_CATALOG_NAME = "Add Class Test Fighter";
const WIZARD = "Wizard";
let COOKIE: string;
let fighterId: string;
let wizardId: string;

const app = createApp();
const url = `/api/characters/${FIXTURE_ID}/class/transactions`;

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Add Class Test Fighter",
  alignment: "True Neutral",
  experiencePoints: 6500, // derived level 5
  armorClass: 16,
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 4, die: "d10", spent: 0 }, // one pending level-up
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

async function tx(body: object) {
  return supertest(app).post(url).set("Cookie", COOKIE).send(body);
}
async function get() {
  return supertest(app).get(`/api/characters/${FIXTURE_ID}`).set("Cookie", COOKIE);
}

describe("POST /api/characters/:id/class/transactions — addClass (#125)", () => {
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: FIGHTER_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);

    const f = await prisma.characterClass.upsert({
      where: { name: FIGHTER_CATALOG_NAME },
      create: {
        name: FIGHTER_CATALOG_NAME,
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

    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [{ name: "fighter", classId: fighterId, position: 0, level: 4 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  // ── single-class serialization is unchanged for existing consumers ─────────────

  it("single-class fixture keeps the flat class/level shape", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.class).toBe("fighter");
    expect(res.body.level).toBe(5);
    expect(res.body.classes).toHaveLength(1);
    expect(res.body.classes[0]).toMatchObject({ name: "fighter", level: 4 });
  });

  // ── happy path: adds a level-1 entry at the next position + rolls HP ───────────

  it("adds Wizard as a 2nd entry at the next position and bumps HP", async () => {
    const res = await tx({ operations: [{ type: "addClass", classId: wizardId }] });
    expect(res.status).toBe(200);
    // d6 average 4 + con 2 = 6
    expect(res.body.hitPoints.max).toBe(36);
    expect(res.body.hitDice.total).toBe(5);
    expect(res.body.classes).toHaveLength(2);
    const wizard = res.body.classes.find((c: { name: string }) => c.name === WIZARD);
    expect(wizard.level).toBe(1);
    // combined level unchanged (still 5); flat shape still points at position-0.
    expect(res.body.level).toBe(5);
    expect(res.body.class).toBe("fighter");

    // Persisted at position 1.
    const entries = await prisma.characterClassEntry.findMany({
      where: { characterId: FIXTURE_ID },
      orderBy: { position: "asc" },
    });
    expect(entries.map((e) => e.position)).toEqual([0, 1]);
    expect(entries[1].name).toBe(WIZARD);
    expect(entries[1].level).toBe(1);
  });

  // ── prerequisite enforcement ──────────────────────────────────────────────────

  it("rejects the add when the 5e ability prerequisite is unmet", async () => {
    await prisma.character.update({
      where: { id: FIXTURE_ID },
      data: { abilityScores: { ...FIXTURE_BASE.abilityScores, intelligence: 12 } },
    });
    const res = await tx({ operations: [{ type: "addClass", classId: wizardId }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Intelligence 13/);

    // No entry created, HP untouched.
    const entries = await prisma.characterClassEntry.findMany({ where: { characterId: FIXTURE_ID } });
    expect(entries).toHaveLength(1);
  });

  it("rejects adding a class the character already has", async () => {
    const res = await tx({ operations: [{ type: "addClass", classId: fighterId }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already has/);
  });

  it("rejects the add when there is no pending level-up (would exceed level cap)", async () => {
    // Apply the pending level so hitDice.total == derived level 5 — nothing to spend.
    await prisma.character.update({
      where: { id: FIXTURE_ID },
      data: { hitDice: { total: 5, die: "d10", spent: 0 } },
    });
    const res = await tx({ operations: [{ type: "addClass", classId: wizardId }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pending level-up/i);

    // No phantom entry created and hit dice untouched (no over-cap state).
    const entries = await prisma.characterClassEntry.findMany({ where: { characterId: FIXTURE_ID } });
    expect(entries).toHaveLength(1);
    const char = await prisma.character.findUniqueOrThrow({ where: { id: FIXTURE_ID } });
    expect((char.hitDice as { total: number }).total).toBe(5);
  });

  // ── guards ──────────────────────────────────────────────────────────────────

  it("404s for an unknown character", async () => {
    const res = await supertest(app)
      .post("/api/characters/does-not-exist/class/transactions")
      .set("Cookie", COOKIE)
      .send({ operations: [{ type: "addClass", classId: wizardId }] });
    expect(res.status).toBe(404);
  });

  it("400s for an unknown classId", async () => {
    const res = await tx({ operations: [{ type: "addClass", classId: "does-not-exist" }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Class not found/);
  });

  it("400s on an out-of-range roll", async () => {
    const res = await tx({ operations: [{ type: "addClass", classId: wizardId, method: "roll", roll: 7 }] });
    expect(res.status).toBe(400);
  });

  // ── audit event + undo ────────────────────────────────────────────────────────

  it("logs a class/classAdded event and undo deletes the entry + restores HP", async () => {
    const add = await tx({ operations: [{ type: "addClass", classId: wizardId }] });
    expect(add.status).toBe(200);
    expect(add.body.hitPoints.max).toBe(36);

    const activity = await supertest(app)
      .get(`/api/characters/${FIXTURE_ID}/activity`)
      .set("Cookie", COOKIE);
    const ev = (activity.body as Array<{ category: string; type: string; reverted: boolean; batchId: string }>).find(
      (e) => e.type === "classAdded" && !e.reverted,
    )!;
    expect(ev).toBeDefined();
    expect(ev.category).toBe("class");

    const undo = await supertest(app)
      .post(`/api/characters/${FIXTURE_ID}/events/${ev.batchId}/revert`)
      .set("Cookie", COOKIE);
    expect(undo.status).toBe(200);
    expect(undo.body.classes).toHaveLength(1);
    expect(undo.body.hitPoints.max).toBe(30);
    expect(undo.body.hitDice.total).toBe(4);

    const entries = await prisma.characterClassEntry.findMany({ where: { characterId: FIXTURE_ID } });
    expect(entries).toHaveLength(1);
  });
});
