import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma, type CharacterEventType } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import {
  applyInventoryOperations,
  currencyCredit,
  currencyDebit,
  InsufficientCurrencyError,
  InvalidInventoryOperationError,
  revertInventoryEvent,
} from "@/lib/inventory/inventory.js";
import { readInventorySnapshot } from "@/lib/inventory/inventory-snapshot-read.js";
import { buildInventorySnapshot } from "@/lib/inventory/inventory-snapshot-build.js";

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
  scopeKey: "global",
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
      where: { scopeKey_name: { scopeKey: "global", name: TEST_ITEM.name } },
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

  it("a multi-op batch sees each prior op's persisted state (per-op re-read)", async () => {
    await applyInventoryOperations(characterAId, [
      { type: "acquire", itemId, quantity: 1, currencyDelta: { cp: 0, sp: 2, gp: 0, pp: 0 } },
      { type: "acquire", itemId, quantity: 1, currencyDelta: { cp: 0, sp: 2, gp: 0, pp: 0 } },
    ]);

    const character = await prisma.character.findUniqueOrThrow({ where: { id: characterAId } });
    expect(character.currency).toEqual({ cp: 0, sp: 1, gp: 10, pp: 0 });

    const items = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });
    expect(items).toHaveLength(2);
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
    // entityId is the item ID at event-write time (soft ref — no SetNull cascade).
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

    const updated = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: created.id } });
    expect(updated.name).toBe("Club +1");
    // #1649: a weapon override patches the `snapshot` blob, not a separate detail table.
    const weapon = readInventorySnapshot(updated).weapon;
    expect(weapon?.damageModifier).toBe(1);
    expect(weapon?.damageDiceFaces).toBe(4);

    const events = await prisma.characterEvent.findMany({ where: { characterId: characterAId, category: "inventory" } });
    expect(events).toHaveLength(1);
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

  it("bulk sell produces N sold events sharing one batchId", async () => {
    await applyInventoryOperations(characterAId, [
      { type: "acquire", itemId, quantity: 1 },
      {
        type: "acquire",
        custom: { name: "Bulk Custom Gem", category: "gear", cost: { cp: 0, sp: 0, gp: 0, pp: 0 } },
        quantity: 1,
      },
    ]);
    const rows = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });
    expect(rows).toHaveLength(2);
    const catalogRow = rows.find((r) => r.itemId === itemId);
    const customRow = rows.find((r) => r.name === "Bulk Custom Gem");
    expect(catalogRow).toBeDefined();
    expect(customRow).toBeDefined();

    await applyInventoryOperations(characterAId, [
      { type: "sell", inventoryItemId: catalogRow!.id, currencyDelta: { cp: 0, sp: 0, gp: 2, pp: 0 } },
      { type: "sell", inventoryItemId: customRow!.id, currencyDelta: { cp: 0, sp: 0, gp: 3, pp: 0 } },
    ]);

    const sold = await prisma.characterEvent.findMany({
      where: { characterId: characterAId, type: "sold" },
      orderBy: { createdAt: "asc" },
    });
    expect(sold).toHaveLength(2);

    expect(sold[0].batchId).not.toBeNull();
    expect(new Set(sold.map((e) => e.batchId)).size).toBe(1);

    const byEntity = new Map(sold.map((e) => [e.entityId, e.data as Record<string, unknown>]));
    expect(byEntity.has(catalogRow!.id)).toBe(true);
    expect(byEntity.has(customRow!.id)).toBe(true);

    const catalogData = byEntity.get(catalogRow!.id)!;
    expect(catalogData.itemName).toBe("Lib Test Club");
    expect(catalogData.quantityDelta).toBe(-1);
    expect(catalogData.currencyDelta).toEqual({ cp: 0, sp: 0, gp: 2, pp: 0 });
    const customData = byEntity.get(customRow!.id)!;
    expect(customData.itemName).toBe("Bulk Custom Gem");
    expect(customData.quantityDelta).toBe(-1);
    expect(customData.currencyDelta).toEqual({ cp: 0, sp: 0, gp: 3, pp: 0 });

    const totalGp = sold.reduce(
      (sum, e) => sum + (((e.data as Record<string, unknown>).currencyDelta as { gp: number }).gp ?? 0),
      0
    );
    expect(totalGp).toBe(5);
    expect(sold.length).toBe(2);
  });

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
    expect(deletedItem.equippedSlot).toBe("MAIN_HAND");
    expect(deletedItem.notes).toBe("keep sharp");
    expect(deletedItem.position).toBe(created.position);
    // #1649: the frozen half is the already-persisted `snapshot` blob, not separate weaponDetail/armorDetail/consumableDetail fields.
    const snapshot = deletedItem.snapshot as Record<string, unknown>;
    expect(snapshot.armor).toBeNull();
    expect(snapshot.consumable).toBeNull();
    expect(snapshot.weapon).toMatchObject({
      damageDiceCount: 1,
      damageDiceFaces: 4,
      damageType: "piercing",
      finesse: true,
      light: true,
    });
  });

  it("setEquipped rejects equipping a non-equippable (gear) item", async () => {
    await applyInventoryOperations(characterAId, [
      { type: "acquire", custom: { name: "Test Rope", category: "gear" }, quantity: 1 },
    ]);
    const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

    await expect(
      applyInventoryOperations(characterAId, [
        { type: "setEquipped", inventoryItemId: created.id, equipped: true },
      ]),
    ).rejects.toThrow(InvalidInventoryOperationError);

    const after = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.equippedSlot).toBeNull();
  });

  it("setEquipped auto-assigns a weapon into MAIN_HAND", async () => {
    await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 1 }]);
    const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

    await applyInventoryOperations(characterAId, [
      { type: "setEquipped", inventoryItemId: created.id, equipped: true },
    ]);

    const after = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.equippedSlot).toBe("MAIN_HAND");
  });

  it("setEquipped can unequip a wearable gear row (clears equippedSlot)", async () => {
    await applyInventoryOperations(characterAId, [
      { type: "acquire", custom: { name: "Wide Belt", category: "gear", slot: "BELT" }, quantity: 1, equipped: true },
    ]);
    const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });
    expect(created.equippedSlot).toBe("BELT");

    await applyInventoryOperations(characterAId, [
      { type: "setEquipped", inventoryItemId: created.id, equipped: false },
    ]);

    const after = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.equippedSlot).toBeNull();
  });

  async function acquireCustom(custom: Record<string, unknown>) {
    await applyInventoryOperations(characterAId, [{ type: "acquire", custom } as never]);
    const rows = await prisma.inventoryItem.findMany({
      where: { characterId: characterAId },
      orderBy: { position: "desc" },
    });
    return rows[0];
  }

  const TWO_HANDED = {
    name: "Greatsword",
    category: "weapon" as const,
    weapon: { damageDiceCount: 2, damageDiceFaces: 6, damageType: "slashing", twoHanded: true, heavy: true },
  };
  const SHIELD = { name: "Shield", category: "armor" as const, armor: { armorCategory: "shield" as const, baseArmorClass: 2 } };
  const RING = (name: string) => ({ name, category: "gear" as const, slot: "RING" as const });

  it("equip places a weapon in MAIN_HAND and derives equipped=true on the wire", async () => {
    await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 1 }]);
    const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

    await applyInventoryOperations(characterAId, [
      { type: "equip", inventoryItemId: created.id, slot: "MAIN_HAND" },
    ]);

    const after = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.equippedSlot).toBe("MAIN_HAND");

    const event = await prisma.characterEvent.findFirstOrThrow({
      where: { characterId: characterAId, type: "equipped" },
    });
    expect((event.before as Record<string, unknown>).equippedSlot).toBeNull();
    expect((event.after as Record<string, unknown>).equippedSlot).toBe("MAIN_HAND");
  });

  it("equip rejects an incompatible slot (a weapon into BODY)", async () => {
    const weapon = await acquireCustom({
      name: "Handaxe",
      category: "weapon",
      weapon: { damageDiceCount: 1, damageDiceFaces: 6, damageType: "slashing" },
    });
    await expect(
      applyInventoryOperations(characterAId, [{ type: "equip", inventoryItemId: weapon.id, slot: "BODY" }]),
    ).rejects.toThrow(InvalidInventoryOperationError);
    const after = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: weapon.id } });
    expect(after.equippedSlot).toBeNull();
  });

  it("equip rejects bag-only gear (slot=null)", async () => {
    const rope = await acquireCustom({ name: "Silk Rope", category: "gear" });
    await expect(
      applyInventoryOperations(characterAId, [{ type: "equip", inventoryItemId: rope.id, slot: "BELT" }]),
    ).rejects.toThrow(InvalidInventoryOperationError);
  });

  it("a two-handed weapon in MAIN_HAND locks OFF_HAND", async () => {
    const gs = await acquireCustom(TWO_HANDED);
    await applyInventoryOperations(characterAId, [{ type: "equip", inventoryItemId: gs.id, slot: "MAIN_HAND" }]);

    const shield = await acquireCustom(SHIELD);
    await expect(
      applyInventoryOperations(characterAId, [{ type: "equip", inventoryItemId: shield.id, slot: "OFF_HAND" }]),
    ).rejects.toThrow(/off-hand is locked/i);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: shield.id } })).equippedSlot).toBeNull();
  });

  it("a two-handed weapon cannot be equipped while the off-hand is occupied", async () => {
    const shield = await acquireCustom(SHIELD);
    await applyInventoryOperations(characterAId, [{ type: "equip", inventoryItemId: shield.id, slot: "OFF_HAND" }]);

    const gs = await acquireCustom(TWO_HANDED);
    await expect(
      applyInventoryOperations(characterAId, [{ type: "equip", inventoryItemId: gs.id, slot: "MAIN_HAND" }]),
    ).rejects.toThrow(/two-handed/i);
  });

  it("RING accepts two rings but rejects the third (reject-on-full)", async () => {
    const r1 = await acquireCustom(RING("Ring of Jumping"));
    const r2 = await acquireCustom(RING("Ring of Swimming"));
    const r3 = await acquireCustom(RING("Ring of Free Action"));

    await applyInventoryOperations(characterAId, [{ type: "equip", inventoryItemId: r1.id, slot: "RING" }]);
    await applyInventoryOperations(characterAId, [{ type: "equip", inventoryItemId: r2.id, slot: "RING" }]);
    await expect(
      applyInventoryOperations(characterAId, [{ type: "equip", inventoryItemId: r3.id, slot: "RING" }]),
    ).rejects.toThrow(/full/i);

    const equipped = await prisma.inventoryItem.findMany({
      where: { characterId: characterAId, equippedSlot: "RING" },
    });
    expect(equipped).toHaveLength(2);
  });

  it("a single-capacity slot rejects a second occupant", async () => {
    const a = await acquireCustom({ name: "Cloak A", category: "gear", slot: "CLOAK" });
    const b = await acquireCustom({ name: "Cloak B", category: "gear", slot: "CLOAK" });
    await applyInventoryOperations(characterAId, [{ type: "equip", inventoryItemId: a.id, slot: "CLOAK" }]);
    await expect(
      applyInventoryOperations(characterAId, [{ type: "equip", inventoryItemId: b.id, slot: "CLOAK" }]),
    ).rejects.toThrow(/full/i);
  });

  it("unequip clears equippedSlot and the equipped event is undoable", async () => {
    const gs = await acquireCustom(TWO_HANDED);
    await applyInventoryOperations(characterAId, [{ type: "equip", inventoryItemId: gs.id, slot: "MAIN_HAND" }]);

    await applyInventoryOperations(characterAId, [{ type: "setEquipped", inventoryItemId: gs.id, equipped: false }]);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: gs.id } })).equippedSlot).toBeNull();

    const unequipped = await prisma.characterEvent.findFirstOrThrow({
      where: { characterId: characterAId, type: "unequipped" },
      orderBy: { createdAt: "desc" },
    });
    await prisma.$transaction((tx) => revertInventoryEvent(tx, characterAId, unequipped));
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: gs.id } })).equippedSlot).toBe("MAIN_HAND");
  });

  it("selling the FULL stack snapshots data.deletedItem; a partial sell does not", async () => {
    await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 5 }]);
    const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

    await applyInventoryOperations(characterAId, [
      { type: "sell", inventoryItemId: created.id, quantity: 2, currencyDelta: { cp: 0, sp: 2, gp: 0, pp: 0 } },
    ]);
    let sold = await prisma.characterEvent.findFirstOrThrow({
      where: { characterId: characterAId, type: "sold" },
      orderBy: { createdAt: "desc" },
    });
    expect((sold.data as Record<string, unknown>).deletedItem).toBeUndefined();

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
    const snapshot = deletedItem.snapshot as Record<string, unknown>;
    expect(snapshot.weapon).toMatchObject({ damageDiceFaces: 4, light: true });
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

    const items = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });
    expect(items).toHaveLength(1);
  });

  it("acquire rejects when neither itemId nor custom is supplied", async () => {
    await expect(
      applyInventoryOperations(characterAId, [{ type: "acquire", quantity: 1 }])
    ).rejects.toThrow(/either itemId or custom/i);
    const items = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });
    expect(items).toHaveLength(0);
  });

  it("acquire rejects an unknown catalog itemId", async () => {
    await expect(
      applyInventoryOperations(characterAId, [{ type: "acquire", itemId: "does-not-exist", quantity: 1 }])
    ).rejects.toThrow(/unknown catalog item/i);
  });

  it("use rejects a non-consumable item", async () => {
    await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 1 }]);
    const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });
    await expect(
      applyInventoryOperations(characterAId, [{ type: "use", inventoryItemId: created.id }])
    ).rejects.toThrow(/not a consumable/i);
  });

  it("use of the last stackable unit deletes the row and snapshots it for undo", async () => {
    await applyInventoryOperations(characterAId, [
      {
        type: "acquire",
        custom: {
          name: "Single Potion",
          category: "consumable",
          consumable: { effectDescription: "heals wounds", effectDiceCount: 1, effectDiceFaces: 4 },
        },
        quantity: 1,
      },
    ]);
    const [potion] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

    await applyInventoryOperations(characterAId, [
      { type: "use", inventoryItemId: potion.id, rolls: [3] },
    ]);

    const remaining = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });
    expect(remaining).toHaveLength(0);
    const event = await prisma.characterEvent.findFirstOrThrow({
      where: { characterId: characterAId, type: "consumed" },
      orderBy: { createdAt: "desc" },
    });
    expect((event.data as Record<string, unknown>).deletedItem).toBeTruthy();
    // Depleting the last unit deletes the row, so `after` is null rather than a quantity.
    expect(event.after).toBeNull();
  });

  it("use of a depleted charged consumable throws without mutating the row", async () => {
    await applyInventoryOperations(characterAId, [
      {
        type: "acquire",
        custom: {
          name: "Spent Wand",
          category: "consumable",
          consumable: { effectDescription: "zap", maxUses: 1, usesRemaining: 0 },
        },
        quantity: 1,
      },
    ]);
    const [wand] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });
    await expect(
      applyInventoryOperations(characterAId, [{ type: "use", inventoryItemId: wand.id }])
    ).rejects.toThrow(/no uses remaining/i);
  });

  async function latestEventOfType(characterId: string, type: CharacterEventType) {
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

      const restored = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: created.id } });
      expect(restored).toMatchObject({
        id: created.id,
        name: "Revert Test Dagger",
        quantity: 4,
        equippedSlot: "MAIN_HAND",
        notes: "sheathed",
        position: created.position,
      });
      // #1649: the recreated row's frozen half comes back from the persisted `snapshot` blob verbatim.
      expect(readInventorySnapshot(restored).weapon).toMatchObject({
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

    it("restores equippedSlot from before for a setEquipped event", async () => {
      await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 1 }]);
      const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

      await applyInventoryOperations(characterAId, [
        { type: "setEquipped", inventoryItemId: created.id, equipped: true },
      ]);
      const equipped = await latestEventOfType(characterAId, "equipped");
      await prisma.$transaction((tx) => revertInventoryEvent(tx, characterAId, equipped));

      const restored = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: created.id } });
      expect(restored.equippedSlot).toBeNull();
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
      expect(character.currency).toEqual({ cp: 0, sp: 5, gp: 10, pp: 0 });
    });

    it("reverses a sale credit (subtracts the proceeds back)", async () => {
      await applyInventoryOperations(characterAId, [{ type: "acquire", itemId, quantity: 2 }]);
      const [created] = await prisma.inventoryItem.findMany({ where: { characterId: characterAId } });

      await applyInventoryOperations(characterAId, [
        { type: "sell", inventoryItemId: created.id, currencyDelta: { cp: 0, sp: 3, gp: 0, pp: 0 } },
      ]);
      let character = await prisma.character.findUniqueOrThrow({ where: { id: characterAId } });
      expect(character.currency).toEqual({ cp: 0, sp: 8, gp: 10, pp: 0 });

      const sold = await latestEventOfType(characterAId, "sold");
      await prisma.$transaction((tx) => revertInventoryEvent(tx, characterAId, sold));

      character = await prisma.character.findUniqueOrThrow({ where: { id: characterAId } });
      expect(character.currency).toEqual({ cp: 0, sp: 5, gp: 10, pp: 0 });
      const restored = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: created.id } });
      expect(restored.quantity).toBe(2);
    });

    // #1646: the audit log is append-only, so pre-merge blobs still name the provenance FK `campaignItemId`; undo must still honour that legacy key.
    it("recreates a pre-merge awarded item from a legacy campaignItemId snapshot", async () => {
      const campaign = await prisma.campaign.create({
        data: { name: "Legacy Snapshot Campaign", ownerId: OWNER_ID, inviteCode: randomUUID() },
      });
      const campaignItem = await prisma.item.create({
        data: {
          name: "Legacy Snapshot Blade",
          category: "gear",
          scope: "CAMPAIGN",
          scopeKey: `campaign:${campaign.id}`,
          campaignId: campaign.id,
        },
      });

      const legacySnapshot = {
        id: "00000000-0000-0000-0000-000000000001",
        itemId: null,
        campaignItemId: campaignItem.id,
        name: "Legacy Snapshot Blade",
        category: "gear",
        weight: null,
        cost: null,
        description: null,
        quantity: 1,
        equippedSlot: null,
        slot: null,
        rarity: null,
        attuned: false,
        requiresAttunement: false,
        attunementPrereqKind: null,
        attunementPrereqValue: null,
        notes: null,
        position: 0,
        usesRemaining: null,
        snapshot: buildInventorySnapshot({
          name: "Legacy Snapshot Blade",
          category: "gear",
          weight: null,
          cost: null,
          description: null,
          slot: null,
          rarity: null,
          requiresAttunement: false,
          attunementPrereqKind: null,
          attunementPrereqValue: null,
          weaponDetail: null,
          armorDetail: null,
          consumableDetail: null,
          capabilities: [],
        }),
        capabilityUses: [],
      };

      await prisma.$transaction((tx) =>
        revertInventoryEvent(tx, characterAId, {
          entityId: legacySnapshot.id,
          before: { name: legacySnapshot.name, quantity: 1, category: "gear" },
          data: { deletedItem: legacySnapshot },
        }),
      );

      const restored = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: legacySnapshot.id } });
      expect(restored.itemId).toBe(campaignItem.id);

      await prisma.inventoryItem.delete({ where: { id: legacySnapshot.id } });
      await prisma.campaign.delete({ where: { id: campaign.id } });
    });
  });
});
