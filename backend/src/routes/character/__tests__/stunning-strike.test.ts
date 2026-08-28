import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { readPinnedEvents } from "@/test-support/events.js";
import { authCookie } from "@/test-support/auth.js";
import { STUNNING_STRIKE_LEVEL } from "@/lib/classes/stunning-strike.js";

const OWNER_ID = "owner-stunning-strike";
let COOKIE: string;
const FIXTURE_ID = "test-stunning-strike-character-1";
const CLASS_NAME = "Stunning Strike Route Test Monk";

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Stunning Strike Test Monk",
  alignment: "Lawful Neutral",
  experiencePoints: 6500, // level 5 → proficiency +3
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 38, max: 38, temp: 0 },
  hitDice: { total: 5, die: "d8" },
  abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
  savingThrowProficiencies: ["strength", "dexterity"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
}
const url = `/api/characters/${FIXTURE_ID}/abilities/stunning-strike/transactions`;

async function seedFocusRow(classId: string) {
  await prisma.classFeature.deleteMany({ where: { classId, subclassId: null } });
  await prisma.classFeature.create({
    data: {
      classId, subclassId: null, name: "Focus", level: 2, edition: "EDITION_2024",
      description: "You have a pool of Focus Points equal to your monk level.",
      resourceKey: "focus", resourceLabel: "Focus Points", resourceRecharge: "short-or-long",
      resourceTotals: [{ minLevel: 2, total: { levelTimes: 1 } }],
    },
  });
}

async function seedKiRow(classId: string) {
  await prisma.classFeature.deleteMany({ where: { classId, subclassId: null } });
  await prisma.classFeature.create({
    data: {
      classId, subclassId: null, name: "Ki", level: 2, edition: "EDITION_2014",
      description: "You have a pool of Ki Points equal to your monk level.",
      resourceKey: "ki", resourceLabel: "Ki Points", resourceRecharge: "short-or-long",
      resourceTotals: [{ minLevel: 2, total: { levelTimes: 1 } }],
    },
  });
}

async function createMonk(level: number, resources?: Prisma.InputJsonValue) {
  const cls = await prisma.characterClass.upsert({
    where: { name: CLASS_NAME },
    create: { name: CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics"], isSpellcaster: false },
    update: {},
  });
  await seedFocusRow(cls.id);
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      ownerId: OWNER_ID,
      resources: resources ?? Prisma.JsonNull,
      classEntries: { create: [{ name: "monk", classId: cls.id, position: 0, level }] },
    },
  });
}

describe("POST /api/characters/:id/abilities/stunning-strike/transactions", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createMonk(5);
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  it("spends 1 focus and rolls a Con save vs DC 14 (Wis 16, prof +3) for a level-5 monk", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "attemptStunningStrike", usedThisTurn: false }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.dc).toBe(14);
    expect(result.roll).toBeGreaterThanOrEqual(1);
    expect(result.roll).toBeLessThanOrEqual(20);
    // SRD 5.2: outcome follows the roll vs DC.
    expect(result.outcome).toBe(result.roll >= result.dc ? "success" : "fail");
    expect(result.summary).toContain(`DC ${result.dc}`);
    expect(result.summary).toContain(`target rolled ${result.roll}`);

    const focusPool = res.body.character.resources.pools.find((p: { key: string }) => p.key === "focus");
    expect(focusPool.remaining).toBe(4);
  });

  it("pins the audit trail of one Stunning Strike attempt", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "attemptStunningStrike", usedThisTurn: false }] });
    expect(res.status).toBe(200);
    const { roll, outcome, summary } = res.body.results[0];
    const noResourcesUsed = {
      resources: { used: {}, maneuversKnown: [], toolProficienciesKnown: [], expertiseKnown: [], choicesKnown: {}, advancements: [] },
    };

    expect(await readPinnedEvents(FIXTURE_ID)).toEqual([
      {
        category: "resources",
        type: "castStunningStrike",
        summary,
        before: null,
        after: null,
        data: { dc: 14, roll, outcome },
      },
      {
        category: "resources",
        type: "spendResource",
        summary: "Spent 1 Focus Points — 4/5 remaining",
        before: noResourcesUsed,
        after: { resources: { ...noResourcesUsed.resources, used: { focus: 1 } } },
        data: { key: "focus", amount: 1, remaining: 4, roll: null },
      },
    ]);
  });

  it("the once-per-turn guard rejects a second attempt in the same turn", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "attemptStunningStrike", usedThisTurn: true }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/once per turn/i);
  });

  it("rejects an attempt with no focus remaining", async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
    await createMonk(5, { used: { focus: 5 } } as Prisma.InputJsonValue);
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "attemptStunningStrike", usedThisTurn: false }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/focus/i);
  });
});

const CLASS_NAME_2014 = "Stunning Strike Route Test Monk 2014";
const FIXTURE_ID_2014 = "test-stunning-strike-character-2014";
const url2014 = `/api/characters/${FIXTURE_ID_2014}/abilities/stunning-strike/transactions`;

async function createMonk2014(level: number, resources?: Prisma.InputJsonValue) {
  const cls = await prisma.characterClass.upsert({
    where: { name: CLASS_NAME_2014 },
    create: { name: CLASS_NAME_2014, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics"], isSpellcaster: false },
    update: {},
  });
  await seedKiRow(cls.id);
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      id: FIXTURE_ID_2014,
      ownerId: OWNER_ID,
      rulesEdition: "EDITION_2014",
      resources: resources ?? Prisma.JsonNull,
      classEntries: { create: [{ name: "monk", classId: cls.id, position: 0, level }] },
    },
  });
}

describe("POST /api/characters/:id/abilities/stunning-strike/transactions — EDITION_2014 (#1500)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createMonk2014(5);
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID_2014 } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME_2014 } });
  });

  it("spends 1 ki (not focus) and rolls a Con save vs DC 14 for a level-5 monk", async () => {
    const res = await agent()
      .post(url2014)
      .send({ operations: [{ type: "attemptStunningStrike", usedThisTurn: false }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.dc).toBe(14);
    expect(result.summary).toContain(`DC ${result.dc}`);

    const kiPool = res.body.character.resources.pools.find((p: { key: string }) => p.key === "ki");
    expect(kiPool.remaining).toBe(4);
    expect(res.body.character.resources.pools.find((p: { key: string }) => p.key === "focus")).toBeUndefined();
  });

  it("succeeds TWICE in the same turn — SRD 5.1 has no once-per-turn cap", async () => {
    const first = await agent()
      .post(url2014)
      .send({ operations: [{ type: "attemptStunningStrike", usedThisTurn: true }] });
    expect(first.status).toBe(200);

    const second = await agent()
      .post(url2014)
      .send({ operations: [{ type: "attemptStunningStrike", usedThisTurn: true }] });
    expect(second.status).toBe(200);

    const kiPool = second.body.character.resources.pools.find((p: { key: string }) => p.key === "ki");
    expect(kiPool.remaining).toBe(3);
  });

  it("rejects an attempt with no ki remaining", async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID_2014 } });
    await createMonk2014(5, { used: { ki: 5 } } as Prisma.InputJsonValue);
    const res = await agent()
      .post(url2014)
      .send({ operations: [{ type: "attemptStunningStrike", usedThisTurn: false }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ki/i);
  });
});

describe("Stunning Strike for a monk below level 5", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createMonk(4);
  });
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  it("rejects a level-4 monk (no Stunning Strike yet)", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "attemptStunningStrike", usedThisTurn: false }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/monk/i);
  });
});

describe("Stunning Strike for a non-monk", () => {
  const FIGHTER_ID = "test-stunning-strike-fighter-1";
  const FIGHTER_CLASS = "Stunning Strike Non-Monk Fighter";
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: FIGHTER_CLASS },
      create: { name: FIGHTER_CLASS, hitDie: "d10", savingThrows: ["strength", "constitution"], skillChoiceCount: 2, skillChoices: ["athletics"], isSpellcaster: false },
      update: {},
    });
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        id: FIGHTER_ID,
        ownerId: OWNER_ID,
        resources: Prisma.JsonNull,
        classEntries: { create: [{ name: "fighter", classId: cls.id, position: 0, level: 5 }] },
      },
    });
  });
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIGHTER_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: FIGHTER_CLASS } });
  });

  it("rejects a non-monk with no Stunning Strike", async () => {
    const res = await agent()
      .post(`/api/characters/${FIGHTER_ID}/abilities/stunning-strike/transactions`)
      .send({ operations: [{ type: "attemptStunningStrike", usedThisTurn: false }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/monk/i);
  });
});

// hasStunningStrike is the single source of the L5 gate — both the serialized
// rider and this route's cast guard read it. The monk class ENTRY's own
// level (not the derived total character level) decides the gate.
describe("Stunning Strike multiclass entry-scoping (#1337)", () => {
  const MULTICLASS_ID = "test-stunning-strike-multiclass-1";
  const multiclassUrl = `/api/characters/${MULTICLASS_ID}/abilities/stunning-strike/transactions`;

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: MULTICLASS_ID } });
  });
  // Last describe in this file to (re-)upsert CLASS_NAME — its own cleanup keeps
  // the class from leaking into other suites' full CharacterClass sweeps.
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  async function createFighterMonk(monkLevel: number) {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const monkClass = await prisma.characterClass.upsert({
      where: { name: CLASS_NAME },
      create: { name: CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics"], isSpellcaster: false },
      update: {},
    });
    await seedFocusRow(monkClass.id);
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        id: MULTICLASS_ID,
        ownerId: OWNER_ID,
        experiencePoints: 64000, // total level 10 (fighter 5 + monk 4 or 5), proficiency +4
        classEntries: {
          create: [
            { name: "fighter", position: 0, level: 5 },
            { name: "monk", classId: monkClass.id, position: 1, level: monkLevel },
          ],
        },
      },
    });
  }

  it("Fighter 5 / Monk below the gate: no Stunning Strike rider, and the guard rejects", async () => {
    await createFighterMonk(STUNNING_STRIKE_LEVEL - 1);

    const character = await agent().get(`/api/characters/${MULTICLASS_ID}`);
    expect(character.body).not.toHaveProperty("stunningStrike");

    const guard = await agent()
      .post(multiclassUrl)
      .send({ operations: [{ type: "attemptStunningStrike", usedThisTurn: false }] });
    expect(guard.status).toBe(400);
    expect(guard.body.error).toMatch(/monk/i);
  });

  it("Fighter 5 / Monk at the gate: the Stunning Strike rider is present, and the guard admits", async () => {
    await createFighterMonk(STUNNING_STRIKE_LEVEL);

    const character = await agent().get(`/api/characters/${MULTICLASS_ID}`);
    expect(character.body).toHaveProperty("stunningStrike");

    const guard = await agent()
      .post(multiclassUrl)
      .send({ operations: [{ type: "attemptStunningStrike", usedThisTurn: false }] });
    expect(guard.status).toBe(200);
    expect(guard.body.character).toHaveProperty("stunningStrike");
  });
});
