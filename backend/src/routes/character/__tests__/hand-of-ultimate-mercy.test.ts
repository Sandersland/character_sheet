/**
 * Hand of Ultimate Mercy route tests (#1248). A level-17+ Warrior of Mercy
 * monk can spend 5 Focus + 1 use of the handOfUltimateMercy pool (1/long
 * rest) to narrate reviving a creature with the client-rolled 4d10 + Wis mod
 * hit points. Off-subclass, under-level, insufficient-resource, and
 * already-used-this-rest cases are all rejected.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-hand-of-ultimate-mercy";
let COOKIE: string;
const FIXTURE_ID = "test-hand-of-ultimate-mercy-character-1";
const CLASS_NAME = "Hand of Ultimate Mercy Route Test Monk";

function fixtureBase(experiencePoints: number) {
  return {
    id: FIXTURE_ID,
    name: "Hand of Ultimate Mercy Test Monk",
    alignment: "Neutral Good",
    experiencePoints,
    initiativeBonus: 0,
    speed: 30,
    hitPoints: { current: 100, max: 100, temp: 0 },
    hitDice: { total: 17, die: "d8" },
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
const url = `/api/characters/${FIXTURE_ID}/hand-of-ultimate-mercy/transactions`;

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

describe("POST /api/characters/:id/hand-of-ultimate-mercy/transactions", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createMonk(225000, 17, "Warrior of Mercy"); // level 17 → focus pool total 17
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  it("spends 5 focus + 1 use and narrates the client-rolled hit points", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "useHandOfUltimateMercy", roll: 27 }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.hpRestored).toBe(27);
    expect(result.summary).toContain("27 hit points");

    const pools: { key: string; remaining: number; total: number }[] = res.body.character.resources.pools;
    const focusPool = pools.find((p) => p.key === "focus")!;
    const ultimateMercyPool = pools.find((p) => p.key === "handOfUltimateMercy")!;
    expect(focusPool.remaining).toBe(focusPool.total - 5);
    expect(ultimateMercyPool.remaining).toBe(0);
    expect(ultimateMercyPool.total).toBe(1);
  });

  it("rejects a non-positive roll", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "useHandOfUltimateMercy", roll: 0 }] });
    expect(res.status).toBe(400);
  });

  it("rejects a second use before a long rest (1/long rest)", async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
    await createMonk(225000, 17, "Warrior of Mercy", { used: { handOfUltimateMercy: 1 } } as Prisma.InputJsonValue);
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "useHandOfUltimateMercy", roll: 27 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/hand of ultimate mercy/i);
  });

  it("rejects with insufficient focus", async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
    await createMonk(225000, 17, "Warrior of Mercy", { used: { focus: 14 } } as Prisma.InputJsonValue); // 17 total, 3 remaining
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "useHandOfUltimateMercy", roll: 27 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/focus/i);
  });
});

describe("Hand of Ultimate Mercy for an under-level or off-subclass monk", () => {
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

  it("rejects a level-16 Warrior of Mercy (below the L17 gate)", async () => {
    await createMonk(195000, 16, "Warrior of Mercy");
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "useHandOfUltimateMercy", roll: 27 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/warrior of mercy/i);
  });

  it("rejects a level-17+ monk of a different subclass", async () => {
    await createMonk(225000, 17, "Way of Shadow");
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "useHandOfUltimateMercy", roll: 27 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/warrior of mercy/i);
  });
});
