import { afterEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { inventoryItemFixtureData } from "@/test-support/inventory-snapshot-fixture.js";
import { WEAPON_BOND_LEVEL } from "@/lib/classes/weapon-bond.js";

const OWNER_ID = "owner-weapon-bond-recon";
let COOKIE: string;
const FIXTURE_ID = "test-weapon-bond-recon-1";

const XP_L2 = 300;
const XP_L3 = 900;

async function createEldritchKnight() {
  await prisma.character.create({
    data: {
      id: FIXTURE_ID,
      name: "Weapon Bond Reconciliation Test EK",
      alignment: "Lawful Neutral",
      experiencePoints: XP_L3,
      initiativeBonus: 2,
      speed: 30,
      hitPoints: { current: 28, max: 28, temp: 0 },
      hitDice: { total: 3, die: "d10" },
      abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 12, wisdom: 10, charisma: 10 },
      savingThrowProficiencies: ["strength", "constitution"],
      skills: [],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      rulesEdition: "EDITION_2014",
      ownerId: OWNER_ID,
      classEntries: { create: [{ name: "fighter", subclass: "Eldritch Knight", position: 0, level: WEAPON_BOND_LEVEL }] },
    },
  });
}

async function makeWeapon(name: string, weaponBonded = false): Promise<string> {
  const row = await prisma.inventoryItem.create({
    data: inventoryItemFixtureData({
      characterId: FIXTURE_ID,
      name,
      category: "weapon",
      weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageType: "slashing" },
      weaponBonded,
    }),
  });
  return row.id;
}

async function postXp(body: object) {
  return supertest(app).post(`/api/characters/${FIXTURE_ID}/experience`).set("Cookie", COOKIE).send(body);
}

describe("Level-down reconciliation clears bonded weapons (#1854)", () => {
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("L3 -> L2 unbonds both weapons, logs weaponUnbonded per item, and undo restores both", async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createEldritchKnight();
    const a = await makeWeapon("Longsword", true);
    const b = await makeWeapon("Rapier", true);

    const res = await postXp({ operations: [{ type: "set", value: XP_L2 }] });
    expect(res.status).toBe(200);

    const items = await prisma.inventoryItem.findMany({ where: { characterId: FIXTURE_ID }, select: { id: true, weaponBonded: true } });
    expect(items.every((i) => !i.weaponBonded)).toBe(true);

    const events = await prisma.characterEvent.findMany({ where: { characterId: FIXTURE_ID, type: "weaponUnbonded" } });
    expect(events).toHaveLength(2);
    expect(new Set(events.map((e) => e.entityId))).toEqual(new Set([a, b]));

    // Every weaponUnbonded row shares ONE batchId with the XP-set op — LIFO undo reverts the whole batch, restoring both.
    const batchId = events[0].batchId;
    const undo = await supertest(app).post(`/api/characters/${FIXTURE_ID}/events/${batchId}/revert`).set("Cookie", COOKIE);
    expect(undo.status).toBe(200);
    const restored = await prisma.inventoryItem.findMany({ where: { characterId: FIXTURE_ID }, select: { weaponBonded: true } });
    expect(restored.every((i) => i.weaponBonded)).toBe(true);
  });

  it("no-op (no events, no error) for a character with nothing bonded", async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createEldritchKnight();
    await makeWeapon("Longsword", false);

    const res = await postXp({ operations: [{ type: "set", value: XP_L2 }] });
    expect(res.status).toBe(200);
    const events = await prisma.characterEvent.findMany({ where: { characterId: FIXTURE_ID, type: "weaponUnbonded" } });
    expect(events).toHaveLength(0);
  });

  it("staying at L3+ leaves bonded weapons untouched", async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createEldritchKnight();
    await makeWeapon("Longsword", true);

    const res = await postXp({ operations: [{ type: "set", value: XP_L3 }] });
    expect(res.status).toBe(200);
    const items = await prisma.inventoryItem.findMany({ where: { characterId: FIXTURE_ID }, select: { weaponBonded: true } });
    expect(items.every((i) => i.weaponBonded)).toBe(true);
  });
});
