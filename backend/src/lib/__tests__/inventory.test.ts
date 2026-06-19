import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../prisma.js";
import {
  applyInventoryOperations,
  currencyCredit,
  currencyDebit,
  InsufficientCurrencyError,
  InvalidInventoryOperationError,
} from "../inventory.js";

describe("currencyDebit", () => {
  it("subtracts each denomination", () => {
    expect(currencyDebit({ cp: 10, sp: 10, gp: 10, pp: 10 }, { cp: 1, sp: 2, gp: 3, pp: 4 })).toEqual({
      cp: 9,
      sp: 8,
      gp: 7,
      pp: 6,
    });
  });

  it("throws InsufficientCurrencyError if any denomination would go negative", () => {
    expect(() => currencyDebit({ cp: 0, sp: 0, gp: 5, pp: 0 }, { cp: 1, sp: 0, gp: 0, pp: 0 })).toThrow(
      InsufficientCurrencyError
    );
  });
});

describe("currencyCredit", () => {
  it("adds each denomination", () => {
    expect(currencyCredit({ cp: 1, sp: 2, gp: 3, pp: 4 }, { cp: 1, sp: 1, gp: 1, pp: 1 })).toEqual({
      cp: 2,
      sp: 3,
      gp: 4,
      pp: 5,
    });
  });
});

const MINIMAL_CHARACTER = {
  name: "Test Fixture",
  alignment: "Lawful Good",
  experiencePoints: 0,
  armorClass: 10,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  journal: [],
};

const TEST_ITEM = {
  name: "Lib Test Club",
  category: "weapon" as const,
  weight: 2,
  cost: { cp: 0, sp: 1, gp: 0, pp: 0 },
};
const TEST_WEAPON_DETAIL = {
  damageDiceCount: 1,
  damageDiceFaces: 4,
  damageType: "bludgeoning",
  light: true,
};

describe("applyInventoryOperations", () => {
  let characterAId: string;
  let characterBId: string;
  let itemId: string;

  afterAll(async () => {
    await prisma.item.deleteMany({ where: { name: TEST_ITEM.name } });
  });

  beforeEach(async () => {
    const item = await prisma.item.upsert({
      where: { name: TEST_ITEM.name },
      create: { ...TEST_ITEM, weaponDetail: { create: TEST_WEAPON_DETAIL } },
      update: {
        ...TEST_ITEM,
        weaponDetail: { upsert: { create: TEST_WEAPON_DETAIL, update: TEST_WEAPON_DETAIL } },
      },
    });
    itemId = item.id;

    const characterA = await prisma.character.create({
      data: { ...MINIMAL_CHARACTER, spellcasting: Prisma.JsonNull, currency: { cp: 0, sp: 5, gp: 10, pp: 0 } },
    });
    characterAId = characterA.id;

    const characterB = await prisma.character.create({
      data: { ...MINIMAL_CHARACTER, spellcasting: Prisma.JsonNull, currency: { cp: 0, sp: 0, gp: 0, pp: 0 } },
    });
    characterBId = characterB.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: { in: [characterAId, characterBId] } } });
  });

  it("acquire (free) creates a row and logs an 'acquired' transaction", async () => {
    await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 2 }]);

    const items = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "Lib Test Club", quantity: 2, itemId });

    const transactions = await prisma.inventoryTransaction.findMany({ where: { characterId: characterAId } });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({ type: "acquired", quantityDelta: 2, inventoryItemId: items[0].id });
  });

  it("acquire with a currencyDelta debits currency and logs 'bought'", async () => {
    await applyInventoryOperations(characterAId, [
      { type: "acquire", itemId, quantity: 1, currencyDelta: { cp: 0, sp: 1, gp: 0, pp: 0 } },
    ]);

    const character = await prisma.character.findUniqueOrThrow({ where: { id: characterAId } });
    expect(character.currency).toEqual({ cp: 0, sp: 4, gp: 10, pp: 0 });

    const [transaction] = await prisma.inventoryTransaction.findMany({ where: { characterId: characterAId } });
    expect(transaction).toMatchObject({ type: "bought", currencyDelta: { cp: 0, sp: -1, gp: 0, pp: 0 } });
  });

  it("rolls back the whole batch when a debit is unaffordable", async () => {
    await expect(
      applyInventoryOperations(characterAId, [
        { type: "acquire", itemId, quantity: 1, currencyDelta: { cp: 0, sp: 0, gp: 999, pp: 0 } },
      ])
    ).rejects.toThrow(InsufficientCurrencyError);

    const items = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });
    expect(items).toHaveLength(0);
    const character = await prisma.character.findUniqueOrThrow({ where: { id: characterAId } });
    expect(character.currency).toEqual({ cp: 0, sp: 5, gp: 10, pp: 0 });
  });

  it("adjustQuantity to zero deletes the row and logs 'consumed', keeping the ledger entry readable", async () => {
    await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 1 }]);
    const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

    await applyInventoryOperations(characterAId, [
      { type: "adjustQuantity", inventoryItemId: created.id, delta: -1 },
    ]);

    const items = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });
    expect(items).toHaveLength(0);

    const transactions = await prisma.inventoryTransaction.findMany({
      where: { characterId: characterAId },
      orderBy: { createdAt: "asc" },
    });
    expect(transactions).toHaveLength(2);
    expect(transactions[1]).toMatchObject({ type: "consumed", quantityDelta: -1, inventoryItemId: null, itemName: "Lib Test Club" });
  });

  it("update edits cosmetic fields and a weapon override without logging a transaction", async () => {
    await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 1 }]);
    const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

    await applyInventoryOperations(characterAId, [
      { type: "update", inventoryItemId: created.id, name: "Club +1", weapon: { damageModifier: 1 } },
    ]);

    const updated = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: created.id },
      include: { weaponDetail: true },
    });
    expect(updated.name).toBe("Club +1");
    expect(updated.weaponDetail?.damageModifier).toBe(1);
    expect(updated.weaponDetail?.damageDiceFaces).toBe(4); // untouched fields survive a partial update

    const transactions = await prisma.inventoryTransaction.findMany({ where: { characterId: characterAId } });
    expect(transactions).toHaveLength(1); // just the original acquire — update is cosmetic, not logged
  });

  it("remove deletes the row outright and logs 'removed'", async () => {
    await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 3 }]);
    const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

    await applyInventoryOperations(characterAId, [{ type: "remove", inventoryItemId: created.id }]);

    const items = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });
    expect(items).toHaveLength(0);

    const transactions = await prisma.inventoryTransaction.findMany({
      where: { characterId: characterAId },
      orderBy: { createdAt: "asc" },
    });
    expect(transactions[1]).toMatchObject({ type: "removed", quantityDelta: -3 });
  });

  it("sell decrements a partial stack and credits currency, logging 'sold'", async () => {
    await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 5 }]);
    const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

    await applyInventoryOperations(characterAId, [
      { type: "sell", inventoryItemId: created.id, quantity: 2, currencyDelta: { cp: 0, sp: 2, gp: 0, pp: 0 } },
    ]);

    const updated = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: created.id } });
    expect(updated.quantity).toBe(3);
    const character = await prisma.character.findUniqueOrThrow({ where: { id: characterAId } });
    expect(character.currency).toEqual({ cp: 0, sp: 7, gp: 10, pp: 0 });
  });

  it("selling the full stack deletes the row", async () => {
    await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 2 }]);
    const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

    await applyInventoryOperations(characterAId, [
      { type: "sell", inventoryItemId: created.id, currencyDelta: { cp: 0, sp: 2, gp: 0, pp: 0 } },
    ]);

    const items = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });
    expect(items).toHaveLength(0);
  });

  it("rejects operating on another character's inventory item", async () => {
    await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 1 }]);
    const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

    await expect(
      applyInventoryOperations(characterBId, [{ type: "remove", inventoryItemId: created.id }])
    ).rejects.toThrow(InvalidInventoryOperationError);

    // Untouched — the rejected op never reached character A's row.
    const items = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });
    expect(items).toHaveLength(1);
  });
});
