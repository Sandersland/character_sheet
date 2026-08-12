/**
 * Beguiling Defenses (Archfey Warlock L10) and Nature's Ward (Circle of the
 * Land Druid L10) — unconditional condition immunity (#1121), through the
 * real conditions route. Neither feature needs an active buff (contrast
 * Mindless Rage, actions-rage-mindless.test.ts): both are permanent once
 * their own level gate is met.
 *
 * Real Postgres in each test; supertest against the shared `app`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-conditions-immunity-features";
let COOKIE: string;

function applyCondition(characterId: string, key: string) {
  return supertest
    .agent(app)
    .set("Cookie", COOKIE)
    .post(`/api/characters/${characterId}/conditions/transactions`)
    .send({ operations: [{ type: "applyCondition", key }] });
}

function getCharacter(characterId: string) {
  return supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${characterId}`);
}

describe("Nature's Ward (Circle of the Land Druid L10, #1121)", () => {
  const DRUID_ID = "test-conditions-immunity-druid";
  let druidClassId: string;
  let landId: string;

  const DRUID_BASE = {
    id: DRUID_ID,
    name: "Nature's Ward Test Druid",
    alignment: "Neutral",
    initiativeBonus: 1,
    speed: 30,
    hitPoints: { current: 55, max: 55, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    hitDice: { total: 10, die: "d8", spent: 0 },
    abilityScores: { strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 18, charisma: 10 },
    savingThrowProficiencies: ["intelligence", "wisdom"],
    skills: [],
    toolProficiencies: [],
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  };

  async function createLandDruid(rulesEdition: "EDITION_2014" | "EDITION_2024", level: number, experiencePoints: number) {
    await prisma.character.create({
      data: {
        ...DRUID_BASE,
        rulesEdition,
        experiencePoints,
        ownerId: OWNER_ID,
        classEntries: {
          create: [{ name: "druid", subclass: "Circle of the Land", subclassId: landId, classId: druidClassId, position: 0, level }],
        },
      },
    });
  }

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    druidClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Druid" } })).id;
    landId = (await prisma.subclass.findFirstOrThrow({ where: { classId: druidClassId, name: "Circle of the Land" } })).id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: DRUID_ID } });
  });

  it("EDITION_2024: an L10 Land druid cannot be given Poisoned", async () => {
    await createLandDruid("EDITION_2024", 10, 64000);
    const res = await applyCondition(DRUID_ID, "poisoned");
    expect(res.status).toBe(400);
  });

  it("EDITION_2014: an L10 Land druid cannot be given Poisoned (unconditional per PHB'14 p.68)", async () => {
    await createLandDruid("EDITION_2014", 10, 64000);
    const res = await applyCondition(DRUID_ID, "poisoned");
    expect(res.status).toBe(400);
  });

  it("EDITION_2014: the elemental/fey charm/fright qualifier is NOT enforced (source-conditional, unmodelable) — Charmed still applies", async () => {
    await createLandDruid("EDITION_2014", 10, 64000);
    const res = await applyCondition(DRUID_ID, "charmed");
    expect(res.status).toBe(200);
  });

  it("below L10, Poisoned is NOT blocked — the row's own level gate, not just the subclass", async () => {
    await createLandDruid("EDITION_2024", 9, 48000);
    const res = await applyCondition(DRUID_ID, "poisoned");
    expect(res.status).toBe(200);
  });

  it("immuneConditions on the serialized character includes poisoned once L10 is reached", async () => {
    await createLandDruid("EDITION_2024", 10, 64000);
    const res = await getCharacter(DRUID_ID);
    expect(res.body.immuneConditions).toEqual(expect.arrayContaining(["poisoned"]));
  });
});

describe("Beguiling Defenses (Archfey Warlock L10, #1121)", () => {
  const WARLOCK_ID = "test-conditions-immunity-warlock";
  let warlockClassId: string;
  let archfeyId: string;

  const WARLOCK_BASE = {
    id: WARLOCK_ID,
    name: "Beguiling Defenses Test Warlock",
    alignment: "Chaotic Neutral",
    initiativeBonus: 1,
    speed: 30,
    hitPoints: { current: 55, max: 55, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    hitDice: { total: 10, die: "d8", spent: 0 },
    abilityScores: { strength: 8, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 18 },
    savingThrowProficiencies: ["wisdom", "charisma"],
    skills: [],
    toolProficiencies: [],
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  };

  async function createArchfeyWarlock(level: number, experiencePoints: number) {
    await prisma.character.create({
      data: {
        ...WARLOCK_BASE,
        rulesEdition: "EDITION_2014", // Archfey has no EDITION_2024 row yet — Warlock #461
        experiencePoints,
        ownerId: OWNER_ID,
        classEntries: {
          create: [{ name: "warlock", subclass: "The Archfey", subclassId: archfeyId, classId: warlockClassId, position: 0, level }],
        },
      },
    });
  }

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    warlockClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Warlock" } })).id;
    archfeyId = (await prisma.subclass.findFirstOrThrow({ where: { classId: warlockClassId, name: "The Archfey" } })).id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: WARLOCK_ID } });
  });

  it("an L10 Archfey warlock cannot be given Charmed", async () => {
    await createArchfeyWarlock(10, 64000);
    const res = await applyCondition(WARLOCK_ID, "charmed");
    expect(res.status).toBe(400);
  });

  it("below L10, Charmed is NOT blocked", async () => {
    await createArchfeyWarlock(9, 48000);
    const res = await applyCondition(WARLOCK_ID, "charmed");
    expect(res.status).toBe(200);
  });

  it("immuneConditions on the serialized character includes charmed once L10 is reached", async () => {
    await createArchfeyWarlock(10, 64000);
    const res = await getCharacter(WARLOCK_ID);
    expect(res.body.immuneConditions).toEqual(expect.arrayContaining(["charmed"]));
  });
});
