import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { inventoryItemFixtureData } from "@/test-support/inventory-snapshot-fixture.js";

const OWNER_ID = "owner-activation-requires";
let COOKIE: string;

const CATALOG_NAME = "Activation Requires Fixture Class";
let classId: string;

const BASE = {
  alignment: "True Neutral",
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 20, max: 20, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 1, die: "d8", spent: 0 },
  abilityScores: { strength: 16, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

async function createCharacter(id: string): Promise<void> {
  await prisma.character.create({
    data: {
      ...BASE,
      id,
      name: `Activation Requires Fixture ${id}`,
      ownerId: OWNER_ID,
      experiencePoints: 0,
      classEntries: { create: [{ name: "activation requires fixture", classId, position: 0, level: 1 }] },
    },
  });
}

async function equipArmor(characterId: string, category: "light" | "medium" | "heavy" | "shield"): Promise<void> {
  const slot = category === "shield" ? "OFF_HAND" : "BODY";
  await prisma.inventoryItem.create({
    data: inventoryItemFixtureData({
      characterId,
      name: `Test ${category} armor`,
      category: "armor",
      equippedSlot: slot,
      armor: {
        armorCategory: category,
        baseArmorClass: category === "shield" ? 2 : 11,
        dexModifierApplies: category !== "heavy" && category !== "shield",
      },
    }),
  });
}

async function seedRows(): Promise<void> {
  const cls = await prisma.characterClass.upsert({
    where: { name: CATALOG_NAME },
    create: { name: CATALOG_NAME, hitDie: "d8", savingThrows: [], skillChoiceCount: 0, skillChoices: [], isSpellcaster: false },
    update: {},
  });
  classId = cls.id;
  await prisma.classFeature.deleteMany({ where: { classId } });
  await prisma.classFeature.create({
    data: {
      classId,
      subclassId: null,
      name: "Test Bladesong",
      level: 1,
      edition: "EDITION_2024",
      description: "Bladesong-shaped toggle fixture row (#1688).",
      activationCost: "bonusAction",
      resolverKind: "toggle",
      resourceKey: "testBladesong",
      resourceLabel: "Test Bladesong",
      resourceRecharge: "longRest",
      resourceTotals: [{ minLevel: 1, total: 5 }],
      costKind: "pool",
      costPoolKey: "testBladesong",
      costBase: 1,
      activationRequires: ["noMediumArmor", "noHeavyArmor", "noShield"],
      effectBuffs: [
        { key: "testBladesong", target: "testBladesong", modifier: 0, duration: "while-active", clearOn: ["equipMediumArmor", "equipHeavyArmor", "equipShield"] },
      ],
    },
  });
  await prisma.classFeature.create({
    data: {
      classId,
      subclassId: null,
      name: "Test Song Of Defense",
      level: 1,
      edition: "EDITION_2024",
      description: "requiresActiveBuff fixture row (#1688) — usable only while Test Bladesong is active.",
      activationCost: "reaction",
      resourceKey: "testSongOfDefense",
      resourceLabel: "Test Song Of Defense",
      resourceRecharge: "longRest",
      resourceTotals: [{ minLevel: 1, total: 99 }],
      activationRequires: [{ requiresActiveBuff: "testBladesong" }],
    },
  });
  await prisma.classFeature.create({
    data: {
      classId,
      subclassId: null,
      name: "Test Body Gate",
      level: 1,
      edition: "EDITION_2024",
      description: "noBodyArmor fixture row (#1688) — the composite any-body-armor gate.",
      activationCost: "bonusAction",
      resolverKind: "toggle",
      resourceKey: "testBodyGate",
      resourceLabel: "Test Body Gate",
      resourceRecharge: "longRest",
      resourceTotals: [{ minLevel: 1, total: 5 }],
      costKind: "pool",
      costPoolKey: "testBodyGate",
      costBase: 1,
      activationRequires: ["noBodyArmor"],
      effectBuffs: [{ key: "testBodyGate", target: "testBodyGate", modifier: 0, duration: "while-active" }],
    },
  });
}

function executeAction(characterId: string, actionKey: string) {
  return supertest
    .agent(app)
    .set("Cookie", COOKIE)
    .post(`/api/characters/${characterId}/actions/transactions`)
    .send({ operations: [{ type: "executeAction", actionKey }] });
}

describe("POST /:id/actions/transactions — declarative activation constraints (#1688)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await seedRows();
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { ownerId: OWNER_ID } });
  });

  afterAll(async () => {
    await prisma.classFeature.deleteMany({ where: { classId } });
    await prisma.characterClass.deleteMany({ where: { name: CATALOG_NAME } });
  });

  it("requiresActiveBuff: 400s testSongOfDefense while testBladesong is inactive", async () => {
    const id = "test-activation-requires-buff-inactive";
    await createCharacter(id);
    const res = await executeAction(id, "testSongOfDefense");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("requires testBladesong to be active");
  });

  it("requiresActiveBuff: succeeds once testBladesong is active", async () => {
    const id = "test-activation-requires-buff-active";
    await createCharacter(id);
    const activate = await executeAction(id, "testBladesong");
    expect(activate.status).toBe(200);

    const res = await executeAction(id, "testSongOfDefense");
    expect(res.status).toBe(200);
    const pool = res.body.resources.pools.find((p: { key: string }) => p.key === "testSongOfDefense");
    expect(pool).toMatchObject({ used: 1 });
  });

  it("noMediumArmor: 400s Test Bladesong's own activation while wearing medium armor", async () => {
    const id = "test-activation-requires-medium";
    await createCharacter(id);
    await equipArmor(id, "medium");
    const res = await executeAction(id, "testBladesong");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("cannot be activated while wearing medium armor");
  });

  it("noHeavyArmor: 400s while wearing heavy armor", async () => {
    const id = "test-activation-requires-heavy";
    await createCharacter(id);
    await equipArmor(id, "heavy");
    const res = await executeAction(id, "testBladesong");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("cannot be activated while wearing heavy armor");
  });

  it("noShield: 400s while wielding a shield", async () => {
    const id = "test-activation-requires-shield";
    await createCharacter(id);
    await equipArmor(id, "shield");
    const res = await executeAction(id, "testBladesong");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("cannot be activated while wielding a shield");
  });

  it("noBodyArmor: 400s while wearing LIGHT armor — the composite any-body-armor gate blocks every category", async () => {
    const id = "test-activation-requires-body";
    await createCharacter(id);
    await equipArmor(id, "light");
    const res = await executeAction(id, "testBodyGate");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("cannot be activated while wearing armor");
  });

  it("light armor does not block activation", async () => {
    const id = "test-activation-requires-light";
    await createCharacter(id);
    await equipArmor(id, "light");
    const res = await executeAction(id, "testBladesong");
    expect(res.status).toBe(200);
  });

  it("unarmored activation succeeds", async () => {
    const id = "test-activation-requires-unarmored";
    await createCharacter(id);
    const res = await executeAction(id, "testBladesong");
    expect(res.status).toBe(200);
  });

  it("a toggle's END half is never gated by activationRequires", async () => {
    const id = "test-activation-requires-end-unaffected";
    await createCharacter(id);
    await equipArmor(id, "medium");
    const res = await executeAction(id, "endTestBladesong");
    expect(res.status).toBe(200);
  });
});
