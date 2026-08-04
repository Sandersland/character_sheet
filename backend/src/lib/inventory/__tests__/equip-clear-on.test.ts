/**
 * The equip hook's generalized `clearOn` metadata path (#1688) —
 * inventory-placement.ts's equipClearTriggers/clearBuffsOnEquipInTx,
 * replacing the old hardcoded "BODY slot -> clear the acUnarmoredBase
 * target" call. A Bladesong-shaped buff (clearOn: medium/heavy/shield only)
 * is the proving case: it must survive donning LIGHT armor, unlike Mage
 * Armor's own "any body armor" shape (covered byte-identically by
 * lib/__tests__/ac-spells.test.ts's unmodified "donning body armor
 * true-ends Mage Armor" test — this file adds the axis that test doesn't
 * cover). Requires DATABASE_URL.
 */

import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { inventoryItemFixtureData } from "@/test-support/inventory-snapshot-fixture.js";
import { applyInventoryOperations } from "@/lib/inventory/inventory.js";
import { normalizeActiveEffectsMutable, serializeActiveEffectsState, type ActiveBuff } from "@/lib/combat/active-effects.js";

const OWNER_ID = "owner-equip-clear-on";
const CHAR_ID = "test-equip-clear-on-character";

const bladesongBuff: ActiveBuff = {
  id: randomUUID(),
  key: "testBladesong",
  target: "testBladesong",
  modifier: 0,
  source: "Test Bladesong",
  duration: "while-active",
  clearOn: ["equipMediumArmor", "equipHeavyArmor", "equipShield"],
};

async function seedBladesongBuff(): Promise<void> {
  await prisma.character.update({
    where: { id: CHAR_ID },
    data: { activeEffects: serializeActiveEffectsState({ buffs: [bladesongBuff] }) },
  });
}

async function readBuffKeys(): Promise<string[]> {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: CHAR_ID }, select: { activeEffects: true } });
  return normalizeActiveEffectsMutable(row.activeEffects).buffs.map((b) => b.key);
}

async function makeArmor(category: "light" | "medium" | "heavy" | "shield") {
  return prisma.inventoryItem.create({
    data: inventoryItemFixtureData({
      characterId: CHAR_ID,
      name: `Test ${category} armor`,
      category: "armor",
      armor: {
        armorCategory: category,
        baseArmorClass: category === "shield" ? 2 : 11,
        dexModifierApplies: category !== "heavy" && category !== "shield",
      },
    }),
  });
}

describe("equip hook — generalized clearOn metadata (#1688)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    await prisma.character.create({
      data: {
        id: CHAR_ID,
        name: "Equip ClearOn Fixture",
        alignment: "Neutral",
        ownerId: OWNER_ID,
        experiencePoints: 0,
        initiativeBonus: 0,
        speed: 30,
        hitPoints: { current: 10, max: 10, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 1, die: "d8", spent: 0 },
        abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
        savingThrowProficiencies: [],
        skills: [],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      },
    });
    await seedBladesongBuff();
  });

  afterEach(async () => {
    await prisma.characterEvent.deleteMany({ where: { characterId: CHAR_ID } });
    await prisma.character.deleteMany({ where: { id: CHAR_ID } });
  });

  it("equipping LIGHT body armor does not clear the buff", async () => {
    const armor = await makeArmor("light");
    await applyInventoryOperations(CHAR_ID, [{ type: "equip", inventoryItemId: armor.id, slot: "BODY" }]);
    expect(await readBuffKeys()).toEqual(["testBladesong"]);
  });

  it("equipping MEDIUM body armor clears the buff and logs a buffCleared event", async () => {
    const armor = await makeArmor("medium");
    await applyInventoryOperations(CHAR_ID, [{ type: "equip", inventoryItemId: armor.id, slot: "BODY" }]);
    expect(await readBuffKeys()).toEqual([]);

    const ev = await prisma.characterEvent.findFirstOrThrow({
      where: { characterId: CHAR_ID, type: "buffCleared" },
      orderBy: { createdAt: "desc" },
    });
    expect(ev.summary).toBe(`Cleared ${bladesongBuff.source} (donned ${armor.name})`);
    expect(ev.data).toEqual({ key: "testBladesong", reason: `donned ${armor.name}`, clearedKeys: ["testBladesong"] });
  });

  it("equipping HEAVY body armor clears the buff", async () => {
    const armor = await makeArmor("heavy");
    await applyInventoryOperations(CHAR_ID, [{ type: "equip", inventoryItemId: armor.id, slot: "BODY" }]);
    expect(await readBuffKeys()).toEqual([]);
  });

  it("equipping a SHIELD clears the buff", async () => {
    const shield = await makeArmor("shield");
    await applyInventoryOperations(CHAR_ID, [{ type: "equip", inventoryItemId: shield.id, slot: "OFF_HAND" }]);
    expect(await readBuffKeys()).toEqual([]);
  });

  it("equipping a MAIN_HAND weapon raises no armor trigger and leaves the buff alone", async () => {
    const weapon = await prisma.inventoryItem.create({
      data: inventoryItemFixtureData({
        characterId: CHAR_ID,
        name: "Test Longsword",
        category: "weapon",
        weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 0, damageType: "slashing", finesse: false, light: false, heavy: false, twoHanded: false, reach: false, thrown: false, ammunition: false },
      }),
    });
    await applyInventoryOperations(CHAR_ID, [{ type: "equip", inventoryItemId: weapon.id, slot: "MAIN_HAND" }]);
    expect(await readBuffKeys()).toEqual(["testBladesong"]);
  });
});
