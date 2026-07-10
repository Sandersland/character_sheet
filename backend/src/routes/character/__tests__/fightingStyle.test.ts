/**
 * Fighting Style class transaction route tests.
 * Mirrors conditions.test.ts: real Postgres in beforeEach, supertest against
 * createApp(). The fixture is a level-5 Fighter (Fighting Style is gained at
 * Fighter L1, so a L5 Fighter qualifies) with a ranged and a melee weapon so
 * Archery's +2-to-ranged-only behavior can be asserted. Uses a UNIQUELY-named
 * catalog class so afterAll cleanup never touches a seeded row; the class entry
 * snapshot name is "fighter" (what the rules logic lowercases/reads).
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-fightingstyle";
let COOKIE: string;

const FIXTURE_ID = "test-fighting-style-character-1";
const FIGHTER_CATALOG_NAME = "FS Route Test Fighter";
const WIZARD_CATALOG_NAME = "FS Route Test Wizard";

// L5 = 6500 XP (well past the 300 needed for L2). Fighters need ~6500 for L5.
const L5_XP = 6500;

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Fighting Style Test Fighter",
  alignment: "Neutral Good",
  experiencePoints: L5_XP,
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 44, max: 44, temp: 0 },
  hitDice: { total: 5, die: "d10" },
  abilityScores: {
    strength: 16,
    dexterity: 16,
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

const RANGED_WEAPON = {
  name: "Longbow",
  category: "weapon" as const,
  equippedSlot: "MAIN_HAND" as const,
  weaponDetail: {
    create: {
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageType: "piercing",
      weaponRange: "ranged" as const,
      twoHanded: true,
    },
  },
};

const MELEE_WEAPON = {
  name: "Longsword",
  category: "weapon" as const,
  equippedSlot: null,
  weaponDetail: {
    create: {
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageType: "slashing",
      weaponRange: "melee" as const,
    },
  },
};

const url = `/api/characters/${FIXTURE_ID}/class/transactions`;
const inventoryUrl = `/api/characters/${FIXTURE_ID}/inventory/transactions`;
const equipLeather = () =>
  supertest.agent(createApp()).set("Cookie", COOKIE).post(inventoryUrl).send({
    operations: [
      {
        type: "acquire",
        custom: { name: "Test Leather", category: "armor", armor: { armorCategory: "light", baseArmorClass: 11 } },
        equipped: true,
      },
    ],
  });

function findWeapon(body: { inventory: Array<{ name: string; weapon?: { attackBonus: number } }> }, name: string) {
  return body.inventory.find((i) => i.name === name)?.weapon;
}

describe("POST /api/characters/:id/class/transactions — setFightingStyle", () => {
  let fighterClassId: string;
  let wizardClassId: string;

  afterAll(async () => {
    await prisma.characterClass.deleteMany({
      where: { name: { in: [FIGHTER_CATALOG_NAME, WIZARD_CATALOG_NAME] } },
    });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const fighter = await prisma.characterClass.upsert({
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
    fighterClassId = fighter.id;

    const wizard = await prisma.characterClass.upsert({
      where: { name: WIZARD_CATALOG_NAME },
      create: {
        name: WIZARD_CATALOG_NAME,
        hitDie: "d6",
        savingThrows: ["intelligence", "wisdom"],
        skillChoiceCount: 2,
        skillChoices: ["arcana", "history"],
        isSpellcaster: true,
      },
      update: {},
    });
    wizardClassId = wizard.id;

    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        ownerId: OWNER_ID,
        classEntries: { create: [{ name: "fighter", classId: fighterClassId, position: 0 }] },
        inventoryItems: { create: [RANGED_WEAPON, MELEE_WEAPON] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  // ── guards ──────────────────────────────────────────────────────────────────

  it("404s for an unknown character", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post("/api/characters/does-not-exist/class/transactions")
      .send({ operations: [{ type: "setFightingStyle", key: "defense" }] });
    expect(res.status).toBe(404);
  });

  it("400s on a malformed body (invalid op type)", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url)
      .send({ operations: [{ type: "notARealType" }] });
    expect(res.status).toBe(400);
  });

  it("400s on an invalid fighting style key", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url)
      .send({ operations: [{ type: "setFightingStyle", key: "notARealStyle" }] });
    expect(res.status).toBe(400);
  });

  // ── surface on read ───────────────────────────────────────────────────────────

  it("a fresh L5 Fighter surfaces fightingStyleChoiceCount=1 and null fightingStyle", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.resources.fightingStyleChoiceCount).toBe(1);
    expect(res.body.resources.fightingStyle).toBeNull();
  });

  // ── defense → +1 AC ───────────────────────────────────────────────────────────

  it("setFightingStyle:defense raises armorClass by 1 while wearing armor and persists the choice", async () => {
    // Defense only applies "while you are wearing armor" (5e), so equip body armor first.
    await equipLeather();
    const before = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
    const baseAC = before.body.armorClass as number;

    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url)
      .send({ operations: [{ type: "setFightingStyle", key: "defense" }] });
    expect(res.status).toBe(200);
    expect(res.body.armorClass).toBe(baseAC + 1);
    expect(res.body.resources.fightingStyle).toBe("defense");

    // Persists across a fresh read.
    const after = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
    expect(after.body.armorClass).toBe(baseAC + 1);
    expect(after.body.resources.fightingStyle).toBe("defense");
  });

  it("setFightingStyle:defense does not raise armorClass when unarmored", async () => {
    const before = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
    const baseAC = before.body.armorClass as number;

    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url)
      .send({ operations: [{ type: "setFightingStyle", key: "defense" }] });
    expect(res.status).toBe(200);
    // Defense requires worn armor, so an unarmored Fighter gains no AC.
    expect(res.body.armorClass).toBe(baseAC);
    expect(res.body.resources.fightingStyle).toBe("defense");
  });

  // ── archery → +2 ranged attack only ──────────────────────────────────────────

  it("setFightingStyle:archery adds +2 to ranged weapon attack, leaves melee unchanged", async () => {
    const before = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
    const baseRanged = findWeapon(before.body, "Longbow")!.attackBonus;
    const baseMelee = findWeapon(before.body, "Longsword")!.attackBonus;

    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url)
      .send({ operations: [{ type: "setFightingStyle", key: "archery" }] });
    expect(res.status).toBe(200);
    expect(findWeapon(res.body, "Longbow")!.attackBonus).toBe(baseRanged + 2);
    expect(findWeapon(res.body, "Longsword")!.attackBonus).toBe(baseMelee);
    // Defense AC bonus does NOT apply for archery.
    expect(res.body.armorClass).toBe(before.body.armorClass);
  });

  // ── non-Fighter rejection ─────────────────────────────────────────────────────

  it("400s when the character is not a Fighter", async () => {
    // Re-point the class entry to a wizard.
    await prisma.characterClassEntry.updateMany({
      where: { characterId: FIXTURE_ID },
      data: { name: "wizard", classId: wizardClassId },
    });
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url)
      .send({ operations: [{ type: "setFightingStyle", key: "archery" }] });
    expect(res.status).toBe(400);
  });

  // ── atomic batch ──────────────────────────────────────────────────────────────

  it("a multi-op batch is atomic: a later failing op rolls back an earlier valid one", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url)
      .send({
        operations: [
          { type: "setFightingStyle", key: "defense" }, // valid
          { type: "setSubclass", subclassId: "does-not-exist" }, // fails → rolls back
        ],
      });
    expect(res.status).toBe(400);

    const after = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
    expect(after.body.resources.fightingStyle).toBeNull();
  });

  // ── clamp-on-read for a non-entitled character ────────────────────────────────

  it("clamps a stale stored fighting style to null when the character isn't a Fighter", async () => {
    // Write a style directly, then change class to wizard (no XP op).
    await prisma.character.update({
      where: { id: FIXTURE_ID },
      data: { resources: { used: {}, maneuversKnown: [], toolProficienciesKnown: [], advancements: [], fightingStyle: "defense" } },
    });
    await prisma.characterClassEntry.updateMany({
      where: { characterId: FIXTURE_ID },
      data: { name: "wizard", classId: wizardClassId },
    });
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
    expect(res.body.resources?.fightingStyle ?? null).toBeNull();
  });

  // ── audit event + undo ────────────────────────────────────────────────────────

  it("logs a resources/fightingStyleChosen event and undo restores before.resources", async () => {
    const app = createApp();
    const before = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
    const baseAC = before.body.armorClass as number;
    await supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "setFightingStyle", key: "defense" }] });

    const activity = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}/activity`);
    const events = activity.body as Array<{
      category: string;
      type: string;
      reverted: boolean;
      batchId?: string;
    }>;
    const ev = events.find((e) => e.type === "fightingStyleChosen" && !e.reverted)!;
    expect(ev).toBeDefined();
    expect(ev.category).toBe("resources");

    const undo = await supertest.agent(app).set("Cookie", COOKIE).post(`/api/characters/${FIXTURE_ID}/events/${ev.batchId}/revert`);
    expect(undo.status).toBe(200);
    expect(undo.body.resources.fightingStyle).toBeNull();
    expect(undo.body.armorClass).toBe(baseAC);
  });
});
