import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";
import {
  applyInventoryOperations,
  currencyCredit,
  currencyDebit,
  InsufficientCurrencyError,
  InvalidInventoryOperationError,
  revertInventoryEvent,
} from "../inventory.js";

const OWNER_ID = "owner-inventory-lib";

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
  toolProficiencies: [],
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
    await ensureTestOwner(OWNER_ID);
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
      data: { ...MINIMAL_CHARACTER, ownerId: OWNER_ID, spellcasting: Prisma.JsonNull, currency: { cp: 0, sp: 5, gp: 10, pp: 0 } },
    });
    characterAId = characterA.id;

    const characterB = await prisma.character.create({
      data: { ...MINIMAL_CHARACTER, ownerId: OWNER_ID, spellcasting: Prisma.JsonNull, currency: { cp: 0, sp: 0, gp: 0, pp: 0 } },
    });
    characterBId = characterB.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: { in: [characterAId, characterBId] } } });
  });

  it("acquire (free) creates a row and logs an 'acquired' event", async () => {
    await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 2 }]);

    const items = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "Lib Test Club", quantity: 2, itemId });

    const events = await prisma.characterEvent.findMany({ where: { characterId: characterAId, category: "inventory" } });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("acquired");
    expect(events[0].entityId).toBe(items[0].id);
    expect((events[0].data as Record<string, unknown>).quantityDelta).toBe(2);
  });

  it("acquire with a currencyDelta debits currency and logs 'bought' event", async () => {
    await applyInventoryOperations(characterAId, [
      { type: "acquire", itemId, quantity: 1, currencyDelta: { cp: 0, sp: 1, gp: 0, pp: 0 } },
    ]);

    const character = await prisma.character.findUniqueOrThrow({ where: { id: characterAId } });
    expect(character.currency).toEqual({ cp: 0, sp: 4, gp: 10, pp: 0 });

    const [event] = await prisma.characterEvent.findMany({ where: { characterId: characterAId, category: "inventory" } });
    expect(event.type).toBe("bought");
    expect((event.data as Record<string, unknown>).currencyDelta).toEqual({ cp: 0, sp: -1, gp: 0, pp: 0 });
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

    const events = await prisma.characterEvent.findMany({
      where: { characterId: characterAId, category: "inventory" },
      orderBy: { createdAt: "asc" },
    });
    expect(events).toHaveLength(2);
    // entityId is the item ID at event-write time (soft ref — no SetNull cascade)
    expect(events[1].type).toBe("consumed");
    expect(events[1].entityId).toBe(created.id);
    expect((events[1].data as Record<string, unknown>).itemName).toBe("Lib Test Club");
    expect((events[1].data as Record<string, unknown>).quantityDelta).toBe(-1);
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

    const events = await prisma.characterEvent.findMany({ where: { characterId: characterAId, category: "inventory" } });
    expect(events).toHaveLength(1); // just the original acquire — update is cosmetic, not logged
  });

  it("remove deletes the row outright and logs 'removed'", async () => {
    await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 3 }]);
    const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

    await applyInventoryOperations(characterAId, [{ type: "remove", inventoryItemId: created.id }]);

    const items = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });
    expect(items).toHaveLength(0);

    const events = await prisma.characterEvent.findMany({
      where: { characterId: characterAId, category: "inventory" },
      orderBy: { createdAt: "asc" },
    });
    expect(events[1].type).toBe("removed");
    expect((events[1].data as Record<string, unknown>).quantityDelta).toBe(-3);
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

  // ── data.deletedItem undo snapshot (Issue #117) ──────────────────────────────

  it("removing a custom weapon snapshots the full row + weapon detail under data.deletedItem", async () => {
    await applyInventoryOperations(characterAId, [
      {
        type: "acquire",
        custom: {
          name: "Snapshot Test Dagger",
          category: "weapon",
          weight: 1,
          cost: { cp: 0, sp: 0, gp: 2, pp: 0 },
          description: "A test blade",
          weapon: { damageDiceCount: 1, damageDiceFaces: 4, damageType: "piercing", finesse: true, light: true },
        },
        quantity: 1,
        equipped: true,
        notes: "keep sharp",
      },
    ]);
    const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

    await applyInventoryOperations(characterAId, [{ type: "remove", inventoryItemId: created.id }]);

    const removed = await prisma.characterEvent.findFirstOrThrow({
      where: { characterId: characterAId, type: "removed" },
    });
    const deletedItem = (removed.data as Record<string, unknown>).deletedItem as Record<string, unknown>;
    expect(deletedItem).toBeDefined();
    expect(deletedItem.id).toBe(created.id);
    expect(deletedItem.name).toBe("Snapshot Test Dagger");
    expect(deletedItem.category).toBe("weapon");
    expect(deletedItem.weight).toBe(1);
    expect(deletedItem.cost).toEqual({ cp: 0, sp: 0, gp: 2, pp: 0 });
    expect(deletedItem.description).toBe("A test blade");
    expect(deletedItem.quantity).toBe(1);
    expect(deletedItem.equipped).toBe(true);
    expect(deletedItem.notes).toBe("keep sharp");
    expect(deletedItem.position).toBe(created.position);
    expect(deletedItem.armorDetail).toBeNull();
    expect(deletedItem.consumableDetail).toBeNull();
    const weaponDetail = deletedItem.weaponDetail as Record<string, unknown>;
    expect(weaponDetail).toMatchObject({
      damageDiceCount: 1,
      damageDiceFaces: 4,
      damageType: "piercing",
      finesse: true,
      light: true,
    });
  });

  it("selling the FULL stack snapshots data.deletedItem; a partial sell does not", async () => {
    await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 5 }]);
    const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

    // Partial sell: row survives, no deletedItem snapshot.
    await applyInventoryOperations(characterAId, [
      { type: "sell", inventoryItemId: created.id, quantity: 2, currencyDelta: { cp: 0, sp: 2, gp: 0, pp: 0 } },
    ]);
    let sold = await prisma.characterEvent.findFirstOrThrow({
      where: { characterId: characterAId, type: "sold" },
      orderBy: { createdAt: "desc" },
    });
    expect((sold.data as Record<string, unknown>).deletedItem).toBeUndefined();

    // Full sell of the remaining 3: row deleted, deletedItem present.
    await applyInventoryOperations(characterAId, [
      { type: "sell", inventoryItemId: created.id, currencyDelta: { cp: 0, sp: 3, gp: 0, pp: 0 } },
    ]);
    sold = await prisma.characterEvent.findFirstOrThrow({
      where: { characterId: characterAId, type: "sold" },
      orderBy: { createdAt: "desc" },
    });
    const deletedItem = (sold.data as Record<string, unknown>).deletedItem as Record<string, unknown>;
    expect(deletedItem).toBeDefined();
    expect(deletedItem.id).toBe(created.id);
    expect(deletedItem.itemId).toBe(itemId);
    expect(deletedItem.quantity).toBe(3);
    const weaponDetail = deletedItem.weaponDetail as Record<string, unknown>;
    expect(weaponDetail).toMatchObject({ damageDiceFaces: 4, light: true });
  });

  it("adjusting to zero snapshots data.deletedItem; a partial adjust does not", async () => {
    await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 3 }]);
    const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

    // Partial adjust down: row survives, no snapshot.
    await applyInventoryOperations(characterAId, [
      { type: "adjustQuantity", inventoryItemId: created.id, delta: -1 },
    ]);
    let consumed = await prisma.characterEvent.findFirstOrThrow({
      where: { characterId: characterAId, type: "consumed" },
      orderBy: { createdAt: "desc" },
    });
    expect((consumed.data as Record<string, unknown>).deletedItem).toBeUndefined();

    // Adjust the remaining 2 to zero: row deleted, snapshot present.
    await applyInventoryOperations(characterAId, [
      { type: "adjustQuantity", inventoryItemId: created.id, delta: -2 },
    ]);
    consumed = await prisma.characterEvent.findFirstOrThrow({
      where: { characterId: characterAId, type: "consumed" },
      orderBy: { createdAt: "desc" },
    });
    const deletedItem = (consumed.data as Record<string, unknown>).deletedItem as Record<string, unknown>;
    expect(deletedItem).toBeDefined();
    expect(deletedItem.id).toBe(created.id);
    expect(deletedItem.quantity).toBe(2);
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

  // ── revertInventoryEvent reconstruction (Issue #117) ─────────────────────────

  async function latestEventOfType(characterId: string, type: string) {
    return prisma.characterEvent.findFirstOrThrow({
      where: { characterId, type },
      orderBy: { createdAt: "desc" },
    });
  }

  describe("revertInventoryEvent", () => {
    it("recreates a deleted row + its weapon detail, reusing the original id", async () => {
      await applyInventoryOperations(characterAId, [
        {
          type: "acquire",
          custom: {
            name: "Revert Test Dagger",
            category: "weapon",
            weight: 1,
            cost: { cp: 0, sp: 0, gp: 2, pp: 0 },
            description: "blade",
            weapon: { damageDiceCount: 1, damageDiceFaces: 4, damageType: "piercing", finesse: true },
          },
          quantity: 4,
          equipped: true,
          notes: "sheathed",
        },
      ]);
      const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

      await applyInventoryOperations(characterAId, [{ type: "remove", inventoryItemId: created.id }]);
      expect(await prisma.inventoryItem.findUnique({ where: { id: created.id } })).toBeNull();

      const removed = await latestEventOfType(characterAId, "removed");
      await prisma.$transaction((tx) => revertInventoryEvent(tx, characterAId, removed));

      const restored = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: created.id },
        include: { weaponDetail: true },
      });
      expect(restored).toMatchObject({
        id: created.id,
        name: "Revert Test Dagger",
        quantity: 4,
        equipped: true,
        notes: "sheathed",
        position: created.position,
      });
      expect(restored.weaponDetail).toMatchObject({
        damageDiceFaces: 4,
        damageType: "piercing",
        finesse: true,
      });
    });

    it("deletes a created row when before is null (acquire undo)", async () => {
      await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 1 }]);
      const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

      const acquired = await latestEventOfType(characterAId, "acquired");
      expect(acquired.before).toBeNull();
      await prisma.$transaction((tx) => revertInventoryEvent(tx, characterAId, acquired));

      expect(await prisma.inventoryItem.findUnique({ where: { id: created.id } })).toBeNull();
    });

    it("restores quantity from before for a partial adjust (row survives)", async () => {
      await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 5 }]);
      const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

      await applyInventoryOperations(characterAId, [
        { type: "adjustQuantity", inventoryItemId: created.id, delta: -2 },
      ]);
      const consumed = await latestEventOfType(characterAId, "consumed");
      await prisma.$transaction((tx) => revertInventoryEvent(tx, characterAId, consumed));

      const restored = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: created.id } });
      expect(restored.quantity).toBe(5);
    });

    it("restores equipped from before for a setEquipped event", async () => {
      await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 1 }]);
      const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

      await applyInventoryOperations(characterAId, [
        { type: "setEquipped", inventoryItemId: created.id, equipped: true },
      ]);
      const equipped = await latestEventOfType(characterAId, "equipped");
      await prisma.$transaction((tx) => revertInventoryEvent(tx, characterAId, equipped));

      const restored = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: created.id } });
      expect(restored.equipped).toBe(false);
    });

    it("reverses a purchase debit (adds the gold back)", async () => {
      await applyInventoryOperations(characterAId, [
        { type: "acquire", itemId, quantity: 1, currencyDelta: { cp: 0, sp: 1, gp: 0, pp: 0 } },
      ]);
      // Start currency { sp: 5, gp: 10 } → after buying for 1 sp → { sp: 4 }.
      let character = await prisma.character.findUniqueOrThrow({ where: { id: characterAId } });
      expect(character.currency).toEqual({ cp: 0, sp: 4, gp: 10, pp: 0 });

      const bought = await latestEventOfType(characterAId, "bought");
      await prisma.$transaction((tx) => revertInventoryEvent(tx, characterAId, bought));

      character = await prisma.character.findUniqueOrThrow({ where: { id: characterAId } });
      expect(character.currency).toEqual({ cp: 0, sp: 5, gp: 10, pp: 0 }); // refunded
    });

    it("reverses a sale credit (subtracts the proceeds back)", async () => {
      await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 2 }]);
      const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

      await applyInventoryOperations(characterAId, [
        { type: "sell", inventoryItemId: created.id, currencyDelta: { cp: 0, sp: 3, gp: 0, pp: 0 } },
      ]);
      let character = await prisma.character.findUniqueOrThrow({ where: { id: characterAId } });
      expect(character.currency).toEqual({ cp: 0, sp: 8, gp: 10, pp: 0 }); // 5 + 3

      const sold = await latestEventOfType(characterAId, "sold");
      await prisma.$transaction((tx) => revertInventoryEvent(tx, characterAId, sold));

      character = await prisma.character.findUniqueOrThrow({ where: { id: characterAId } });
      expect(character.currency).toEqual({ cp: 0, sp: 5, gp: 10, pp: 0 }); // proceeds removed
      // …and the row is back (full sell deleted it).
      const restored = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: created.id } });
      expect(restored.quantity).toBe(2);
    });
  });
});
