/**
 * Fighting Style feats (#1137) — end-to-end derivation. A level-5 Fighter takes
 * a Fighting Style feat via the advancement endpoint's fightingStyle slot, and
 * its mechanical effect is derived at read time exactly as the former scalar
 * styles were: Archery +2 to ranged attack rolls only, Defense +1 AC while
 * wearing body armor only.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-fs-feats";
let COOKIE: string;
const FIXTURE_ID = "test-fs-feats-1";
const L5_XP = 6500;

const app = createApp();
let archeryFeatId: string;
let defenseFeatId: string;

const advUrl = `/api/characters/${FIXTURE_ID}/advancement/transactions`;
const invUrl = `/api/characters/${FIXTURE_ID}/inventory/transactions`;
const get = () => supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
const takeStyle = (featId: string) =>
  supertest.agent(app).set("Cookie", COOKIE).post(advUrl).send({
    operations: [{ type: "takeFeat", featId, slot: "fightingStyle" }],
  });
const acquire = (custom: unknown) =>
  supertest.agent(app).set("Cookie", COOKIE).post(invUrl).send({ operations: [{ type: "acquire", custom, equipped: true }] });

function findWeapon(body: { inventory: Array<{ name: string; weapon?: { attackBonus: number } }> }, name: string) {
  return body.inventory.find((i) => i.name === name)?.weapon;
}

const leather = { name: "Test Leather", category: "armor", armor: { armorCategory: "light", baseArmorClass: 11 } };

beforeAll(async () => {
  const archery = await prisma.feat.upsert({
    where: { name: "Archery (FS Feat Test)" },
    create: {
      name: "Archery (FS Feat Test)", description: "+2 ranged attack.", category: "fighting_style",
      prerequisite: "Fighting Style feature",
      improvements: [{ target: "rangedAttackRoll", amount: 2 }] as unknown as Prisma.InputJsonValue,
    },
    update: { category: "fighting_style", improvements: [{ target: "rangedAttackRoll", amount: 2 }] as unknown as Prisma.InputJsonValue },
  });
  archeryFeatId = archery.id;
  const defense = await prisma.feat.upsert({
    where: { name: "Defense (FS Feat Test)" },
    create: {
      name: "Defense (FS Feat Test)", description: "+1 AC while armored.", category: "fighting_style",
      prerequisite: "Fighting Style feature",
      improvements: [{ target: "armorClassWhileArmored", amount: 1 }] as unknown as Prisma.InputJsonValue,
    },
    update: { category: "fighting_style", improvements: [{ target: "armorClassWhileArmored", amount: 1 }] as unknown as Prisma.InputJsonValue },
  });
  defenseFeatId = defense.id;
});

afterAll(async () => {
  await prisma.feat.deleteMany({ where: { name: { in: ["Archery (FS Feat Test)", "Defense (FS Feat Test)"] } } });
});

beforeEach(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  await prisma.character.create({
    data: {
      id: FIXTURE_ID, name: "FS Feats Fixture", alignment: "True Neutral",
      ownerId: OWNER_ID, experiencePoints: L5_XP, initiativeBonus: 3, speed: 30,
      hitPoints: { current: 44, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 5, die: "d10", spent: 0 },
      abilityScores: { strength: 16, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
      savingThrowProficiencies: [], skills: [], toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      spellcasting: Prisma.JsonNull,
      classEntries: { create: [{ position: 0, name: "Fighter", level: 5 }] },
      inventoryItems: {
        create: [
          { name: "Longbow", category: "weapon", equippedSlot: "MAIN_HAND",
            weaponDetail: { create: { damageDiceCount: 1, damageDiceFaces: 8, damageType: "piercing", weaponRange: "ranged", twoHanded: true } } },
          { name: "Longsword", category: "weapon",
            weaponDetail: { create: { damageDiceCount: 1, damageDiceFaces: 8, damageType: "slashing", weaponRange: "melee" } } },
        ],
      },
    },
  });
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
});

describe("Archery Fighting Style feat", () => {
  it("adds +2 to ranged attack rolls only, leaving melee unchanged", async () => {
    const before = (await get()).body;
    const baseRanged = findWeapon(before, "Longbow")!.attackBonus;
    const baseMelee = findWeapon(before, "Longsword")!.attackBonus;

    const res = await takeStyle(archeryFeatId);
    expect(res.status).toBe(200);
    const after = (await get()).body;
    expect(findWeapon(after, "Longbow")!.attackBonus).toBe(baseRanged + 2);
    expect(findWeapon(after, "Longsword")!.attackBonus).toBe(baseMelee);
  });
});

describe("Defense Fighting Style feat", () => {
  it("adds +1 AC while wearing body armor", async () => {
    await acquire(leather);
    const before = (await get()).body;
    const res = await takeStyle(defenseFeatId);
    expect(res.status).toBe(200);
    const after = (await get()).body;
    expect(after.armorClass).toBe(before.armorClass + 1);
  });

  it("adds no AC while unarmored", async () => {
    const before = (await get()).body;
    await takeStyle(defenseFeatId);
    const after = (await get()).body;
    expect(after.armorClass).toBe(before.armorClass);
  });
});
