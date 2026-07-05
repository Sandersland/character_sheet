/**
 * Durable-buff (#455) integration test — the axis beyond #438 concentration:
 * a while-active "meleeDamage" buff raises melee weapon damage via the serializer,
 * concentration-clear leaves durable buffs alone, and until-rest buffs clear on
 * the matching rest. Requires DATABASE_URL (docker compose up db).
 */

import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { prisma } from "../prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";
import { authCookie } from "../../test-support/auth.js";
import {
  appendActiveBuffInTx,
  clearBuffByKeyInTx,
  clearBuffsForSourceInTx,
  normalizeActiveEffectsMutable,
  type ActiveBuff,
} from "../active-effects.js";
import { applyHitPointOperations } from "../hitpoints.js";

const OWNER_ID = "owner-durable-buffs";
const FIXTURE_ID = "test-durable-buffs-character-1";
let COOKIE: string;

const GREATSWORD = {
  name: "Greatsword",
  category: "weapon" as const,
  equipped: true,
  weaponDetail: {
    create: { damageDiceCount: 2, damageDiceFaces: 6, damageType: "slashing", weaponRange: "melee" as const, twoHanded: true },
  },
};

async function applyBuff(buff: Omit<ActiveBuff, "id">) {
  await prisma.$transaction((tx) => appendActiveBuffInTx(tx, FIXTURE_ID, buff, randomUUID(), null));
}

async function readBuffs() {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: FIXTURE_ID }, select: { activeEffects: true } });
  return normalizeActiveEffectsMutable(row.activeEffects).buffs;
}

async function greatswordDamageMod(): Promise<number> {
  const res = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
  expect(res.status).toBe(200);
  const gs = (res.body.inventory as Array<{ name: string; weapon?: { damage: { damageModifier: number } } }>)
    .find((i) => i.name === "Greatsword");
  return gs!.weapon!.damage.damageModifier;
}

describe("durable buffs (#455)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await prisma.character.create({
      data: {
        id: FIXTURE_ID,
        name: "Durable Buff Barbarian",
        alignment: "Neutral",
        ownerId: OWNER_ID,
        experiencePoints: 0,
        initiativeBonus: 2,
        speed: 30,
        hitPoints: { current: 20, max: 20, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 3, die: "d12", spent: 1 },
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        savingThrowProficiencies: [],
        skills: [{ name: "athletics", ability: "strength", proficient: false }],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        inventoryItems: { create: [GREATSWORD] },
      },
    });
  });

  afterEach(async () => {
    await prisma.characterEvent.deleteMany({ where: { characterId: FIXTURE_ID } });
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("a while-active meleeDamage +2 buff raises melee weapon damage by 2; clearing reverts", async () => {
    expect(await greatswordDamageMod()).toBe(3); // STR mod only
    await applyBuff({ key: "rage", target: "meleeDamage", modifier: 2, source: "Rage", duration: "while-active" });
    expect(await greatswordDamageMod()).toBe(5);
    await prisma.$transaction((tx) => clearBuffByKeyInTx(tx, FIXTURE_ID, "rage", randomUUID(), null, "endRage"));
    expect(await greatswordDamageMod()).toBe(3);
  });

  it("a concentration-clear does NOT drop a durable buff sharing the source entry id", async () => {
    await applyBuff({ key: "rage", target: "meleeDamage", modifier: 2, source: "Rage", duration: "while-active", sourceEntryId: "e1" });
    await applyBuff({ key: "bless", target: "athletics", modifier: 1, source: "Bless", duration: "concentration", sourceEntryId: "e1" });
    await prisma.$transaction((tx) => clearBuffsForSourceInTx(tx, FIXTURE_ID, "e1", randomUUID(), null, "damage"));
    const buffs = await readBuffs();
    expect(buffs.map((b) => b.key)).toEqual(["rage"]); // concentration Bless dropped, durable Rage kept
  });

  it("until-rest (long) clears on a long rest; a concentration buff is unaffected", async () => {
    await applyBuff({ key: "rage", target: "meleeDamage", modifier: 2, source: "Rage", duration: "until-rest", restType: "long" });
    await applyBuff({ key: "guidance", target: "athletics", modifier: 1, source: "Guidance", duration: "concentration" });
    await applyHitPointOperations(FIXTURE_ID, [{ type: "longRest" }]);
    expect((await readBuffs()).map((b) => b.key)).toEqual(["guidance"]);
  });

  it("until-rest (short) survives a short rest only if it is a long-rest buff", async () => {
    await applyBuff({ key: "shortBuff", target: "meleeDamage", modifier: 1, source: "Second Wind Buff", duration: "until-rest", restType: "short" });
    await applyBuff({ key: "longBuff", target: "meleeDamage", modifier: 2, source: "Rage", duration: "until-rest", restType: "long" });
    await applyHitPointOperations(FIXTURE_ID, [{ type: "shortRest", rolls: [] }]);
    expect((await readBuffs()).map((b) => b.key)).toEqual(["longBuff"]); // short cleared, long survives a short rest
  });
});
