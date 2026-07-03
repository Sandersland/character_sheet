/**
 * Conditions route integration tests.
 * Mirrors spellcasting.test.ts: real Postgres in beforeEach, supertest against
 * createApp(). The fixture is a minimal level-1 Fighter (conditions are not
 * level- or class-derived, so a plain character suffices).
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";
import { authCookie } from "../../test-support/auth.js";

// ── Character fixture ─────────────────────────────────────────────────────────

const OWNER_ID = "owner-conditions";
let COOKIE: string;

const FIXTURE_ID = "test-conditions-character-1";

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Conditions Test Fighter",
  alignment: "Neutral Good",
  experiencePoints: 0,
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 12, max: 12, temp: 0 },
  hitDice: { total: 1, die: "d10" },
  abilityScores: {
    strength: 16,
    dexterity: 12,
    constitution: 14,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  },
  savingThrowProficiencies: ["strength", "constitution"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 10, pp: 0 },
};

describe("POST /api/characters/:id/conditions/transactions", () => {
  let fighterClassId: string;
  const FIGHTER_CATALOG_NAME = "Conditions Route Test Fighter";

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: FIGHTER_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: FIGHTER_CATALOG_NAME },
      create: {
        name: FIGHTER_CATALOG_NAME,
        hitDie: "d10",
        savingThrows: ["strength", "constitution"],
        skillChoiceCount: 2,
        skillChoices: ["athletics", "intimidation"],
        isSpellcaster: false,
      },
      update: {},
    });
    fighterClassId = cls.id;

    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        ownerId: OWNER_ID,
        classEntries: { create: [{ name: "fighter", classId: fighterClassId, position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  const url = `/api/characters/${FIXTURE_ID}/conditions/transactions`;

  // ── 404 / 400 guards ──────────────────────────────────────────────────────

  it("404s for an unknown character", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post("/api/characters/does-not-exist/conditions/transactions")
      .send({ operations: [{ type: "applyCondition", key: "prone" }] });
    expect(res.status).toBe(404);
  });

  it("400s on a malformed body (invalid op type)", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url)
      .send({ operations: [{ type: "notARealType" }] });
    expect(res.status).toBe(400);
  });

  it("400s on an unknown condition key", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url)
      .send({ operations: [{ type: "applyCondition", key: "onFire" }] });
    expect(res.status).toBe(400);
  });

  it("defaults a fresh character to empty conditions + exhaustion 0", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.conditions).toEqual({ active: [], exhaustion: 0 });
  });

  // ── applyCondition ────────────────────────────────────────────────────────

  it("applyCondition adds the condition to the active list", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url)
      .send({ operations: [{ type: "applyCondition", key: "poisoned", source: "Giant Spider" }] });

    expect(res.status).toBe(200);
    const active = res.body.conditions.active as Array<{
      key: string;
      source?: string;
      appliedAt: string;
    }>;
    expect(active).toHaveLength(1);
    expect(active[0].key).toBe("poisoned");
    expect(active[0].source).toBe("Giant Spider");
    expect(typeof active[0].appliedAt).toBe("string");
  });

  it("400s when applying a condition that is already active", async () => {
    const app = createApp();
    await supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "applyCondition", key: "prone" }] });
    const dup = await supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "applyCondition", key: "prone" }] });
    expect(dup.status).toBe(400);
  });

  // ── batch ─────────────────────────────────────────────────────────────────

  it("applies multiple conditions in one batch", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url)
      .send({
        operations: [
          { type: "applyCondition", key: "prone" },
          { type: "applyCondition", key: "grappled" },
          { type: "setExhaustion", level: 2 },
        ],
      });

    expect(res.status).toBe(200);
    const keys = (res.body.conditions.active as Array<{ key: string }>).map((c) => c.key).sort();
    expect(keys).toEqual(["grappled", "prone"]);
    expect(res.body.conditions.exhaustion).toBe(2);
  });

  it("a multi-op batch is atomic: a later failing op rolls back an earlier valid one", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url)
      .send({
        operations: [
          { type: "applyCondition", key: "stunned" },           // valid
          { type: "removeCondition", key: "blinded" },          // invalid (not active) — rolls back
        ],
      });
    expect(res.status).toBe(400);

    const char = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
    expect(char.body.conditions.active).toHaveLength(0);
  });

  // ── removeCondition ───────────────────────────────────────────────────────

  it("removeCondition removes an active condition", async () => {
    const app = createApp();
    await supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "applyCondition", key: "frightened" }] });
    const res = await supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "removeCondition", key: "frightened" }] });

    expect(res.status).toBe(200);
    expect(res.body.conditions.active).toHaveLength(0);
  });

  it("400s when removing a condition that is not active", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url)
      .send({ operations: [{ type: "removeCondition", key: "restrained" }] });
    expect(res.status).toBe(400);
  });

  // ── setExhaustion (0–6 incl. clamping) ────────────────────────────────────

  it("setExhaustion sets the exhaustion level", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url)
      .send({ operations: [{ type: "setExhaustion", level: 3 }] });
    expect(res.status).toBe(200);
    expect(res.body.conditions.exhaustion).toBe(3);
  });

  it("setExhaustion accepts the upper bound of 6", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url)
      .send({ operations: [{ type: "setExhaustion", level: 6 }] });
    expect(res.status).toBe(200);
    expect(res.body.conditions.exhaustion).toBe(6);
  });

  it("400s on setExhaustion above 6", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url)
      .send({ operations: [{ type: "setExhaustion", level: 7 }] });
    expect(res.status).toBe(400);
  });

  it("400s on setExhaustion below 0", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url)
      .send({ operations: [{ type: "setExhaustion", level: -1 }] });
    expect(res.status).toBe(400);
  });

  it("clamps a stale out-of-range stored exhaustion on read", async () => {
    // Write an out-of-range value directly, bypassing the validated route.
    await prisma.character.update({
      where: { id: FIXTURE_ID },
      data: { conditions: { active: [], exhaustion: 99 } },
    });
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
    expect(res.body.conditions.exhaustion).toBe(6);
  });

  it("drops an unknown stored condition key on read", async () => {
    await prisma.character.update({
      where: { id: FIXTURE_ID },
      data: {
        conditions: {
          active: [
            { key: "poisoned", appliedAt: new Date().toISOString() },
            { key: "onFire", appliedAt: new Date().toISOString() },
          ],
          exhaustion: 0,
        },
      },
    });
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
    const keys = (res.body.conditions.active as Array<{ key: string }>).map((c) => c.key);
    expect(keys).toEqual(["poisoned"]);
  });

  // ── undo via the revert route ─────────────────────────────────────────────

  it("undo restores conditions removed by a batch", async () => {
    const app = createApp();
    // Apply two conditions.
    await supertest.agent(app).set("Cookie", COOKIE)
      .post(url)
      .send({ operations: [{ type: "applyCondition", key: "prone" }, { type: "applyCondition", key: "poisoned" }] });

    // Remove one in a fresh batch.
    await supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "removeCondition", key: "prone" }] });

    // Find the latest non-reverted batch (the removeCondition) and undo it.
    const activity = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}/activity`);
    const events = activity.body as Array<{ type: string; reverted: boolean; batchId?: string }>;
    const latestRemove = events.find((e) => e.type === "conditionRemoved" && !e.reverted)!;
    expect(latestRemove).toBeDefined();

    const undo = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/events/${latestRemove.batchId}/revert`);
    expect(undo.status).toBe(200);
    const keys = (undo.body.conditions.active as Array<{ key: string }>).map((c) => c.key).sort();
    expect(keys).toEqual(["poisoned", "prone"]);
  });

  it("undo restores a prior exhaustion level", async () => {
    const app = createApp();
    await supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "setExhaustion", level: 2 }] });
    await supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "setExhaustion", level: 5 }] });

    const activity = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}/activity`);
    const events = activity.body as Array<{ type: string; reverted: boolean; batchId?: string }>;
    const latest = events.find((e) => e.type === "exhaustionSet" && !e.reverted)!;

    const undo = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/events/${latest.batchId}/revert`);
    expect(undo.status).toBe(200);
    expect(undo.body.conditions.exhaustion).toBe(2);
  });
});
