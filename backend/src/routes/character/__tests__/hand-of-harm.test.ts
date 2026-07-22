/**
 * Hand of Harm route tests (#1248). A level-3+ Warrior of Mercy monk can
 * spend 1 Focus once per turn to narrate a client-rolled necrotic bonus on an
 * Unarmed Strike hit; Physician's Touch (L6+) adds the Poisoned rider to the
 * summary. Flurry of Healing and Harm (L11+) can spend a free use of its own
 * pool instead of Focus. Off-subclass, under-level, and once-per-turn
 * violations are all rejected.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-hand-of-harm";
let COOKIE: string;
const FIXTURE_ID = "test-hand-of-harm-character-1";
const CLASS_NAME = "Hand of Harm Route Test Monk";

function fixtureBase(experiencePoints: number) {
  return {
    id: FIXTURE_ID,
    name: "Hand of Harm Test Monk",
    alignment: "Neutral Good",
    experiencePoints,
    initiativeBonus: 0,
    speed: 30,
    hitPoints: { current: 24, max: 24, temp: 0 },
    hitDice: { total: 3, die: "d8" },
    abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
    savingThrowProficiencies: ["strength", "dexterity"],
    skills: [],
    toolProficiencies: [],
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  };
}

function agent() {
  return supertest.agent(createApp()).set("Cookie", COOKIE);
}
const url = `/api/characters/${FIXTURE_ID}/hand-of-harm/transactions`;

async function createMonk(experiencePoints: number, level: number, subclass?: string, resources?: Prisma.InputJsonValue) {
  const cls = await prisma.characterClass.upsert({
    where: { name: CLASS_NAME },
    create: { name: CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics"], isSpellcaster: false },
    update: {},
  });
  await prisma.character.create({
    data: {
      ...fixtureBase(experiencePoints),
      ownerId: OWNER_ID,
      resources: resources ?? Prisma.JsonNull,
      classEntries: { create: [{ name: "monk", classId: cls.id, position: 0, level, subclass }] },
    },
  });
}

describe("POST /api/characters/:id/hand-of-harm/transactions", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createMonk(900, 3, "Warrior of Mercy"); // level 3 → focus pool total 3
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  it("spends 1 focus and narrates the client-rolled necrotic damage", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "dealHandOfHarm", usedThisTurn: false, roll: 7 }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.necroticDamage).toBe(7);
    expect(result.poisoned).toBe(false);
    expect(result.summary).toContain("7 necrotic damage");

    const focusPool = res.body.character.resources.pools.find((p: { key: string }) => p.key === "focus");
    expect(focusPool.remaining).toBe(2); // 3 total − 1 spent
  });

  it("the once-per-turn guard rejects a second hit in the same turn", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "dealHandOfHarm", usedThisTurn: true, roll: 7 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/once per turn/i);
  });

  it("rejects a non-positive roll", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "dealHandOfHarm", usedThisTurn: false, roll: 0 }] });
    expect(res.status).toBe(400);
  });

  it("rejects a hit with no focus remaining", async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
    await createMonk(900, 3, "Warrior of Mercy", { used: { focus: 3 } } as Prisma.InputJsonValue);
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "dealHandOfHarm", usedThisTurn: false, roll: 7 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/focus/i);
  });
});

describe("Physician's Touch (L6+) adds the Poisoned rider", () => {
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

  it("does not poison at L3", async () => {
    await createMonk(900, 3, "Warrior of Mercy");
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "dealHandOfHarm", usedThisTurn: false, roll: 5 }] });
    expect(res.body.results[0].poisoned).toBe(false);
    expect(res.body.results[0].summary).not.toMatch(/poisoned/i);
  });

  it("poisons at L6", async () => {
    await createMonk(14000, 6, "Warrior of Mercy");
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "dealHandOfHarm", usedThisTurn: false, roll: 5 }] });
    expect(res.body.results[0].poisoned).toBe(true);
    expect(res.body.results[0].summary).toMatch(/poisoned/i);
  });
});

describe("Flurry of Healing and Harm (L11+) spends a free use instead of Focus", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createMonk(85000, 11, "Warrior of Mercy"); // Wis 16 → +3 mod → 3 free uses
  });
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  it("spends flurryOfHealingAndHarm, not focus, when freeFromFlurry is set", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "dealHandOfHarm", usedThisTurn: false, roll: 9, freeFromFlurry: true }] });
    expect(res.status).toBe(200);
    const pools: { key: string; remaining: number; total: number }[] = res.body.character.resources.pools;
    const focusPool = pools.find((p) => p.key === "focus")!;
    const flurryPool = pools.find((p) => p.key === "flurryOfHealingAndHarm")!;
    expect(focusPool.remaining).toBe(focusPool.total); // untouched
    expect(flurryPool.remaining).toBe(flurryPool.total - 1);
  });

  it("rejects freeFromFlurry below level 11", async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
    await createMonk(900, 3, "Warrior of Mercy");
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "dealHandOfHarm", usedThisTurn: false, roll: 9, freeFromFlurry: true }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/level 11/i);
  });
});

describe("Hand of Harm for an under-level or off-subclass monk", () => {
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

  it("rejects a level-2 Warrior of Mercy (below the L3 gate)", async () => {
    await createMonk(300, 2, "Warrior of Mercy");
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "dealHandOfHarm", usedThisTurn: false, roll: 5 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/warrior of mercy/i);
  });

  it("rejects a level-3+ monk of a different subclass", async () => {
    await createMonk(6500, 5, "Way of Shadow");
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "dealHandOfHarm", usedThisTurn: false, roll: 5 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/warrior of mercy/i);
  });
});
