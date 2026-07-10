import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { characterInclude } from "@/lib/character-include.js";
import { serializeCharacter } from "@/lib/character-serialize.js";
import { applyHitPointOperations } from "@/lib/hitpoints.js";
import { applyInventoryOperations, itemBuffKey } from "@/lib/inventory.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";

const OWNER_ID = "owner-activated-effect";

const BASE_CHAR = {
  name: "Boots Fixture",
  alignment: "Neutral Good",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

// Boots of Speed: bonus action, +30 speed, once per long rest, until a long rest.
const bootsCapability = {
  kind: "activatedEffect" as const,
  activation: "bonus" as const,
  target: "speed" as const,
  op: "add" as const,
  value: 30,
  activatedDuration: "untilRest" as const,
  resourceKind: "perRest" as const,
  resourcePeriod: "long" as const,
  resourceCharges: 1,
  durationText: "10 minutes",
};

async function serialize(characterId: string) {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: characterInclude });
  return serializeCharacter(row);
}

async function buffCount(characterId: string, itemId: string): Promise<number> {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, select: { activeEffects: true } });
  const buffs = ((row.activeEffects as { buffs?: { key: string }[] } | null)?.buffs ?? []);
  return buffs.filter((b) => b.key === itemBuffKey(itemId)).length;
}

describe("item activatedEffect activate/deactivate (#543)", () => {
  let characterId: string;
  let itemId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    const character = await prisma.character.create({
      data: {
        ...BASE_CHAR,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        classEntries: { create: { name: "Fighter", level: 1, position: 0 } },
      },
    });
    characterId = character.id;
    const item = await prisma.inventoryItem.create({
      data: {
        character: { connect: { id: characterId } },
        name: "Boots of Speed",
        category: "gear",
        quantity: 1,
        attuned: true,
        requiresAttunement: true,
        capabilities: { create: [bootsCapability] },
      },
    });
    itemId = item.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: characterId } });
  });

  it("serializes the activated control state (uses, active flag, reminder)", async () => {
    const before = (await serialize(characterId)).inventory.find((i) => i.id === itemId)!;
    expect(before.activated).toMatchObject({
      activation: "bonus",
      remainingUses: 1,
      maxUses: 1,
      active: false,
      available: true,
    });
    expect(before.activated?.reminder).toContain("10 minutes");

    await applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: itemId }]);
    const after = (await serialize(characterId)).inventory.find((i) => i.id === itemId)!;
    expect(after.activated).toMatchObject({ remainingUses: 0, active: true });
  });

  it("activate spends the use and speed reflects the buff", async () => {
    await applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: itemId }]);

    const view = await serialize(characterId);
    expect(view.speed).toBe(60);
    const row = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(row.activatedUsesSpent).toBe(1);
    expect(await buffCount(characterId, itemId)).toBe(1);
  });

  it("deactivate clears the buff immediately (use stays spent)", async () => {
    await applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: itemId }]);
    await applyInventoryOperations(characterId, [{ type: "deactivate", inventoryItemId: itemId }]);

    expect((await serialize(characterId)).speed).toBe(30);
    expect(await buffCount(characterId, itemId)).toBe(0);
    const row = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(row.activatedUsesSpent).toBe(1);
  });

  it("blocks activation at 0 remaining uses", async () => {
    await applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: itemId }]);
    await applyInventoryOperations(characterId, [{ type: "deactivate", inventoryItemId: itemId }]);
    await expect(
      applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: itemId }]),
    ).rejects.toThrow(/no uses remaining/i);
  });

  it("long rest restores the use and clears any lingering buff", async () => {
    await applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: itemId }]);
    await applyHitPointOperations(characterId, [{ type: "longRest" }]);

    const row = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(row.activatedUsesSpent).toBe(0);
    expect(await buffCount(characterId, itemId)).toBe(0);
    // Use is restored — can activate again.
    await applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: itemId }]);
    expect((await serialize(characterId)).speed).toBe(60);
  });

  it("unattune clears an active buff with no residue", async () => {
    await applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: itemId }]);
    await applyInventoryOperations(characterId, [{ type: "unattune", inventoryItemId: itemId }]);

    expect((await serialize(characterId)).speed).toBe(30);
    expect(await buffCount(characterId, itemId)).toBe(0);
  });

  it("requires the item be equipped or attuned to activate", async () => {
    await prisma.inventoryItem.update({ where: { id: itemId }, data: { attuned: false } });
    await expect(
      applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: itemId }]),
    ).rejects.toThrow(/equipped or attuned/i);
  });

  it("short rest does not recharge a long-rest item", async () => {
    await applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: itemId }]);
    await applyHitPointOperations(characterId, [{ type: "shortRest", rolls: [] }]);
    const row = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(row.activatedUsesSpent).toBe(1);
  });

  it("removing an active item clears its buff (no leak, no residue)", async () => {
    await applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: itemId }]);
    expect((await serialize(characterId)).speed).toBe(60);

    await applyInventoryOperations(characterId, [{ type: "remove", inventoryItemId: itemId }]);
    expect(await buffCount(characterId, itemId)).toBe(0);
    expect((await serialize(characterId)).speed).toBe(30);
  });

  it("selling the full stack of an active item clears its buff", async () => {
    await applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: itemId }]);
    await applyInventoryOperations(characterId, [
      { type: "sell", inventoryItemId: itemId, currencyDelta: { cp: 0, sp: 0, gp: 5, pp: 0 } },
    ]);
    expect(await buffCount(characterId, itemId)).toBe(0);
    expect((await serialize(characterId)).speed).toBe(30);
  });

  it("blocks double-activation — second activate while already active throws", async () => {
    await applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: itemId }]);
    await expect(
      applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: itemId }]),
    ).rejects.toThrow(/already active/i);
    // Uses not double-spent: still 1 spent, not 2.
    const row = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(row.activatedUsesSpent).toBe(1);
  });
});
