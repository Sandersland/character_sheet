/**
 * Quivering Palm route tests (#1245). A level-17 Warrior of the Open Hand
 * (Wis 16, prof +6) has focus DC 17. Set spends 4 focus and marks vibrations
 * active; Trigger requires an active set, rolls a flat d20 Con save vs the DC,
 * halves the client-rolled 10d12 on a success, and clears the active flag.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-quivering-palm";
let COOKIE: string;
const FIXTURE_ID = "test-quivering-palm-character-1";
const CLASS_NAME = "Quivering Palm Route Test Monk";

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Quivering Palm Test Monk",
  alignment: "Lawful Neutral",
  experiencePoints: 225000, // level 17 → proficiency +6
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 120, max: 120, temp: 0 },
  hitDice: { total: 17, die: "d8" },
  abilityScores: { strength: 10, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 16, charisma: 10 },
  savingThrowProficiencies: ["strength", "dexterity"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

function agent() {
  return supertest.agent(createApp()).set("Cookie", COOKIE);
}
const url = `/api/characters/${FIXTURE_ID}/quivering-palm/transactions`;

async function createMonk(level: number, subclass?: string) {
  const cls = await prisma.characterClass.upsert({
    where: { name: CLASS_NAME },
    create: { name: CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics"], isSpellcaster: false },
    update: {},
  });
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      ownerId: OWNER_ID,
      classEntries: { create: [{ name: "monk", classId: cls.id, position: 0, level, subclass }] },
    },
  });
}

describe("POST /api/characters/:id/quivering-palm/transactions", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createMonk(17, "Warrior of the Open Hand");
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  it("setQuiveringPalm spends 4 focus and marks vibrations active for 17 days", async () => {
    const res = await agent().post(url).send({ operations: [{ type: "setQuiveringPalm" }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.active).toBe(true);
    expect(result.daysRemaining).toBe(17);

    const focusPool = res.body.character.resources.pools.find((p: { key: string }) => p.key === "focus");
    expect(focusPool.remaining).toBe(13); // 17 total − 4 spent
    expect(res.body.character.quiveringPalm).toEqual({ dc: 17, active: true });
  });

  it("cannot set again while already active ('only one creature at a time')", async () => {
    await agent().post(url).send({ operations: [{ type: "setQuiveringPalm" }] });
    const res = await agent().post(url).send({ operations: [{ type: "setQuiveringPalm" }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/only one creature/i);
  });

  it("triggerQuiveringPalm requires an active set", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "triggerQuiveringPalm", roll: 60 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no vibrations/i);
  });

  it("triggerQuiveringPalm rolls a flat d20 vs DC 17, halves on success, and clears the active flag", async () => {
    await agent().post(url).send({ operations: [{ type: "setQuiveringPalm" }] });
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "triggerQuiveringPalm", roll: 60 }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.dc).toBe(17);
    expect(result.saveRoll).toBeGreaterThanOrEqual(1);
    expect(result.saveRoll).toBeLessThanOrEqual(20);
    expect(result.rawDamage).toBe(60);
    if (result.outcome === "success") {
      expect(result.appliedDamage).toBe(30);
    } else {
      expect(result.appliedDamage).toBe(60);
    }
    expect(res.body.character.quiveringPalm).toEqual({ dc: 17, active: false });
  });

  it("triggering does not spend additional focus (only the Set spent 4)", async () => {
    await agent().post(url).send({ operations: [{ type: "setQuiveringPalm" }] });
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "triggerQuiveringPalm", roll: 60 }] });
    const focusPool = res.body.character.resources.pools.find((p: { key: string }) => p.key === "focus");
    expect(focusPool.remaining).toBe(13); // unchanged from the Set spend
  });
});

describe("Quivering Palm for an under-level or off-subclass monk", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
  });
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  it("rejects a level-16 Warrior of the Open Hand (below the L17 gate)", async () => {
    await createMonk(16, "Warrior of the Open Hand");
    const res = await agent().post(url).send({ operations: [{ type: "setQuiveringPalm" }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/warrior of the open hand/i);
  });

  it("rejects a level-17+ monk of a different subclass", async () => {
    await createMonk(20, "Warrior of Shadow");
    const res = await agent().post(url).send({ operations: [{ type: "setQuiveringPalm" }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/warrior of the open hand/i);
  });
});
