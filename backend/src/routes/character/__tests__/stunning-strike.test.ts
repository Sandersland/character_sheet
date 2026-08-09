/**
 * Stunning Strike route tests (#1242). A level-5 monk (Wis 16, prof +3) has
 * focus DC 14; the once-per-turn guard rejects a repeat attempt, insufficient
 * focus is rejected, and a non-monk (or a monk below L5) has no Stunning Strike.
 * #1500 adds a 2014 (Ki) counterpart proving the once-per-turn guard is
 * LIFTED and the resource spend targets "ki" instead of "focus".
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { readPinnedEvents } from "@/test-support/events.js";
import { authCookie } from "@/test-support/auth.js";

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

async function createMonk(level: number, resources?: Prisma.InputJsonValue) {
  const cls = await prisma.characterClass.upsert({
    where: { name: CLASS_NAME },
    create: { name: CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics"], isSpellcaster: false },
    update: {},
  });
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
    // Outcome is internally consistent with the roll vs DC (SRD 5.2 save rule).
    expect(result.outcome).toBe(result.roll >= result.dc ? "success" : "fail");
    expect(result.summary).toContain(`DC ${result.dc}`);
    expect(result.summary).toContain(`target rolled ${result.roll}`);

    // Focus was actually spent — the resource pool reflects it.
    const focusPool = res.body.character.resources.pools.find((p: { key: string }) => p.key === "focus");
    expect(focusPool.remaining).toBe(4); // 5 total − 1 spent
  });

  // #1275 byte-identity oracle: captured on the per-feature URL before the move to
  // the shared ability endpoint, so a green run afterwards is evidence the audit
  // trail is unchanged.
  it("pins the audit trail of one Stunning Strike attempt", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "attemptStunningStrike", usedThisTurn: false }] });
    expect(res.status).toBe(200);
    const { roll, outcome, summary } = res.body.results[0];
    const noResourcesUsed = {
      resources: { used: {}, maneuversKnown: [], toolProficienciesKnown: [], choicesKnown: {}, advancements: [] },
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
    expect(kiPool.remaining).toBe(4); // 5 total − 1 spent
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
    expect(kiPool.remaining).toBe(3); // 5 total − 2 spent across the two attempts
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

// #1337: hasStunningStrike (stunning-strike.ts) is the single source of the
// L5 gate — both the serialized rider and this route's cast guard read it.
// Proven with a Fighter/Monk multiclass, where the monk class ENTRY's own
// level (not the derived total character level) decides the gate.
describe("Stunning Strike multiclass entry-scoping (#1337)", () => {
  const MULTICLASS_ID = "test-stunning-strike-multiclass-1";
  const multiclassUrl = `/api/characters/${MULTICLASS_ID}/abilities/stunning-strike/transactions`;

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: MULTICLASS_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  async function createFighterMonk(monkLevel: number) {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        id: MULTICLASS_ID,
        ownerId: OWNER_ID,
        classEntries: {
          create: [
            { name: "fighter", position: 0, level: 5 },
            { name: "monk", position: 1, level: monkLevel },
          ],
        },
      },
    });
  }

  it("Fighter 5 / Monk 4: no Stunning Strike rider, and the guard rejects", async () => {
    await createFighterMonk(4);

    const character = await agent().get(`/api/characters/${MULTICLASS_ID}`);
    expect(character.body).not.toHaveProperty("stunningStrike");

    const guard = await agent()
      .post(multiclassUrl)
      .send({ operations: [{ type: "attemptStunningStrike", usedThisTurn: false }] });
    expect(guard.status).toBe(400);
    expect(guard.body.error).toMatch(/monk/i);
  });

  it("Fighter 5 / Monk 5: the Stunning Strike rider is present, and the guard admits", async () => {
    await createFighterMonk(5);

    const character = await agent().get(`/api/characters/${MULTICLASS_ID}`);
    expect(character.body).toHaveProperty("stunningStrike");

    const guard = await agent()
      .post(multiclassUrl)
      .send({ operations: [{ type: "attemptStunningStrike", usedThisTurn: false }] });
    expect(guard.status).toBe(200);
    expect(guard.body.character).toHaveProperty("stunningStrike");
  });
});
