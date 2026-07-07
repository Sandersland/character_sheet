import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";
import { applyInventoryOperations, revertInventoryEvent, isHealingConsumable } from "../inventory.js";
import { applyHitPointOperations } from "../hitpoints.js";

const OWNER_ID = "owner-consumable-use";

const BASE_CHARACTER = {
  name: "Consumer",
  alignment: "Lawful Good",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 1, max: 20, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 4, die: "d8", spent: 0 },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
};

async function getConsumableDetail(inventoryItemId: string) {
  return prisma.inventoryConsumableDetail.findUnique({ where: { inventoryItemId } });
}

async function firstInventoryItem(characterId: string) {
  const items = await prisma.inventoryItem.findMany({ where: { characterId } });
  return items[0];
}

describe("isHealingConsumable", () => {
  it("matches healing descriptions, not others", () => {
    expect(isHealingConsumable("Restores hit points")).toBe(true);
    expect(isHealingConsumable("Heals the drinker")).toBe(true);
    expect(isHealingConsumable("Deals 1d6 fire damage")).toBe(false);
    expect(isHealingConsumable(null)).toBe(false);
    expect(isHealingConsumable(undefined)).toBe(false);
  });
});

describe("use consumable", () => {
  let characterId: string;
  const catalogPotionName = "Consumable-Use Test Potion";

  afterAll(async () => {
    await prisma.item.deleteMany({ where: { name: catalogPotionName } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    const character = await prisma.character.create({
      data: { ...BASE_CHARACTER, ownerId: OWNER_ID, spellcasting: Prisma.JsonNull, currency: { cp: 0, sp: 0, gp: 0, pp: 0 } },
    });
    characterId = character.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: characterId } });
  });

  it("stackable heal: decrements quantity, rolls, heals through HP domain, logs one consumed event", async () => {
    await applyInventoryOperations(characterId, [
      {
        type: "acquire",
        custom: {
          name: "Potion of Healing",
          category: "consumable",
          consumable: { effectDiceCount: 2, effectDiceFaces: 4, effectModifier: 2, effectDescription: "Restores hit points" },
        },
        quantity: 2,
      },
    ]);
    const item = await firstInventoryItem(characterId);

    const [result] = await applyInventoryOperations(characterId, [
      { type: "use", inventoryItemId: item.id, rolls: [4, 4] },
    ]);

    expect(result.total).toBe(10);
    expect(result.applied).toBe("heal");
    expect(result.quantity).toBe(1);

    const after = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(after?.quantity).toBe(1);

    const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect((character.hitPoints as { current: number }).current).toBe(11);

    // One consumed event carrying the roll; plus the heal event through HP domain.
    const consumed = await prisma.characterEvent.findMany({
      where: { characterId, category: "inventory", type: "consumed" },
    });
    expect(consumed).toHaveLength(1);
    const data = consumed[0].data as Record<string, unknown>;
    expect(data.rolls).toEqual([4, 4]);
    expect(data.total).toBe(10);
    expect(data.applied).toBe("heal");

    const heals = await prisma.characterEvent.findMany({ where: { characterId, category: "hitPoints", type: "heal" } });
    expect(heals).toHaveLength(1);
  });

  it("stackable use to zero removes the row (deleted-item snapshot for undo)", async () => {
    await applyInventoryOperations(characterId, [
      {
        type: "acquire",
        custom: { name: "Last Potion", category: "consumable", consumable: { effectDiceCount: 1, effectDiceFaces: 4, effectDescription: "Restores hit points" } },
        quantity: 1,
      },
    ]);
    const item = await firstInventoryItem(characterId);

    await applyInventoryOperations(characterId, [{ type: "use", inventoryItemId: item.id, rolls: [3] }]);

    expect(await prisma.inventoryItem.findUnique({ where: { id: item.id } })).toBeNull();
  });

  it("charged: decrements usesRemaining, stays at 0 with use disabled until recharge", async () => {
    await applyInventoryOperations(characterId, [
      {
        type: "acquire",
        custom: { name: "Wand of Sparks", category: "consumable", consumable: { maxUses: 2, effectDiceCount: 1, effectDiceFaces: 6, effectDescription: "Deals lightning damage" } },
        quantity: 1,
      },
    ]);
    const item = await firstInventoryItem(characterId);
    expect((await getConsumableDetail(item.id))?.usesRemaining).toBe(2);

    await applyInventoryOperations(characterId, [{ type: "use", inventoryItemId: item.id, rolls: [5] }]);
    expect((await getConsumableDetail(item.id))?.usesRemaining).toBe(1);

    await applyInventoryOperations(characterId, [{ type: "use", inventoryItemId: item.id, rolls: [2] }]);
    expect((await getConsumableDetail(item.id))?.usesRemaining).toBe(0);

    // Row survives at 0 charges.
    expect(await prisma.inventoryItem.findUnique({ where: { id: item.id } })).not.toBeNull();

    // Use at 0 is rejected.
    await expect(
      applyInventoryOperations(characterId, [{ type: "use", inventoryItemId: item.id, rolls: [3] }]),
    ).rejects.toThrow();
  });

  it("long rest recharges charged consumables to full", async () => {
    await applyInventoryOperations(characterId, [
      {
        type: "acquire",
        custom: { name: "Wand of Sparks", category: "consumable", consumable: { maxUses: 3, effectDiceCount: 1, effectDiceFaces: 6, effectDescription: "Deals lightning damage" } },
        quantity: 1,
      },
    ]);
    const item = await firstInventoryItem(characterId);
    await applyInventoryOperations(characterId, [{ type: "use", inventoryItemId: item.id, rolls: [5] }]);
    await applyInventoryOperations(characterId, [{ type: "use", inventoryItemId: item.id, rolls: [5] }]);
    expect((await getConsumableDetail(item.id))?.usesRemaining).toBe(1);

    await applyHitPointOperations(characterId, [{ type: "longRest" }]);
    expect((await getConsumableDetail(item.id))?.usesRemaining).toBe(3);
  });

  it("non-heal effect rolls + records but does not auto-apply", async () => {
    await applyInventoryOperations(characterId, [
      {
        type: "acquire",
        custom: { name: "Alchemist's Fire", category: "consumable", consumable: { effectDiceCount: 1, effectDiceFaces: 6, effectDescription: "Deals fire damage" } },
        quantity: 1,
      },
    ]);
    const item = await firstInventoryItem(characterId);
    const before = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });

    const [result] = await applyInventoryOperations(characterId, [{ type: "use", inventoryItemId: item.id, rolls: [6] }]);
    expect(result.total).toBe(6);
    expect(result.applied).toBeNull();

    const after = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect((after.hitPoints as { current: number }).current).toBe((before.hitPoints as { current: number }).current);

    const heals = await prisma.characterEvent.findMany({ where: { characterId, category: "hitPoints", type: "heal" } });
    expect(heals).toHaveLength(0);
  });

  it("rejects a use op on a non-consumable", async () => {
    await applyInventoryOperations(characterId, [
      {
        type: "acquire",
        custom: { name: "Dagger", category: "weapon", weapon: { damageDiceCount: 1, damageDiceFaces: 4, damageType: "piercing" } },
        quantity: 1,
      },
    ]);
    const item = await firstInventoryItem(characterId);
    await expect(
      applyInventoryOperations(characterId, [{ type: "use", inventoryItemId: item.id }]),
    ).rejects.toThrow();
  });

  it("undo restores quantity for a stackable use", async () => {
    await applyInventoryOperations(characterId, [
      {
        type: "acquire",
        custom: { name: "Potion of Healing", category: "consumable", consumable: { effectDiceCount: 2, effectDiceFaces: 4, effectModifier: 2, effectDescription: "Restores hit points" } },
        quantity: 3,
      },
    ]);
    const item = await firstInventoryItem(characterId);
    await applyInventoryOperations(characterId, [{ type: "use", inventoryItemId: item.id, rolls: [1, 1] }]);
    expect((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))?.quantity).toBe(2);

    const consumed = await prisma.characterEvent.findFirstOrThrow({
      where: { characterId, category: "inventory", type: "consumed" },
    });
    await prisma.$transaction((tx) => revertInventoryEvent(tx, characterId, consumed));
    expect((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))?.quantity).toBe(3);
  });

  it("undo restores usesRemaining for a charged use", async () => {
    await applyInventoryOperations(characterId, [
      {
        type: "acquire",
        custom: { name: "Wand of Sparks", category: "consumable", consumable: { maxUses: 2, effectDiceCount: 1, effectDiceFaces: 6, effectDescription: "Deals lightning damage" } },
        quantity: 1,
      },
    ]);
    const item = await firstInventoryItem(characterId);
    await applyInventoryOperations(characterId, [{ type: "use", inventoryItemId: item.id, rolls: [4] }]);
    expect((await getConsumableDetail(item.id))?.usesRemaining).toBe(1);

    const consumed = await prisma.characterEvent.findFirstOrThrow({
      where: { characterId, category: "inventory", type: "consumed" },
    });
    await prisma.$transaction((tx) => revertInventoryEvent(tx, characterId, consumed));
    expect((await getConsumableDetail(item.id))?.usesRemaining).toBe(2);
  });

  it("catalog charged item snapshots usesRemaining defaulted to maxUses on acquire", async () => {
    const catalog = await prisma.item.create({
      data: {
        name: catalogPotionName,
        category: "consumable",
        consumableDetail: { create: { effectDiceCount: 1, effectDiceFaces: 6, effectDescription: "Deals lightning damage", maxUses: 5 } },
      },
    });
    await applyInventoryOperations(characterId, [{ type: "acquire", itemId: catalog.id, quantity: 1 }]);
    const item = await firstInventoryItem(characterId);
    const detail = await getConsumableDetail(item.id);
    expect(detail?.maxUses).toBe(5);
    expect(detail?.usesRemaining).toBe(5);
  });
});
