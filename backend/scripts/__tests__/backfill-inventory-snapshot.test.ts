// backfill-inventory-snapshot (#1648, epic #1644): fills InventoryItem.snapshot
// for rows the migration left null, via buildInventorySnapshot — the same
// builder Task 4's dual-write uses. Requires DATABASE_URL.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { inventorySnapshotSchema } from "@character-sheet/contracts";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { backfillInventorySnapshot } from "../backfill-inventory-snapshot.js";

const OWNER_ID = "owner-backfill-inventory-snapshot";
const CHAR_ID = "test-backfill-inventory-snapshot-char";

const BASE_CHAR = {
  alignment: "Neutral",
  initiativeBonus: 0,
  speed: 30,
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  hitPoints: { current: 20, max: 20, temp: 0 },
  hitDice: { total: 3, die: "d6" },
  abilityScores: {
    strength: 10, dexterity: 12, constitution: 12,
    intelligence: 10, wisdom: 10, charisma: 10,
  },
};

beforeEach(async () => {
  await ensureTestOwner(OWNER_ID);
  await prisma.character.create({
    data: { ...BASE_CHAR, id: CHAR_ID, name: "Backfill Fixture", ownerId: OWNER_ID, experiencePoints: 0, spellcasting: Prisma.JsonNull },
  });
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: CHAR_ID } });
});

describe("backfillInventorySnapshot (#1648)", () => {
  it("backfills a row with weapon detail, and the result parses", async () => {
    const created = await prisma.inventoryItem.create({
      data: {
        characterId: CHAR_ID,
        name: "Longsword",
        category: "weapon",
        quantity: 1,
        position: 0,
        weaponDetail: {
          create: {
            damageDiceCount: 1,
            damageDiceFaces: 8,
            damageModifier: 0,
            damageType: "slashing",
            weaponClass: "martial",
            weaponRange: "melee",
          },
        },
      },
    });

    const result = await backfillInventorySnapshot(prisma);

    expect(result.backfilledItems).toContain(created.id);
    const row = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: created.id } });
    const parsed = inventorySnapshotSchema.safeParse(row.snapshot);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("round-trips armor + consumable + capability fields exactly", async () => {
    const created = await prisma.inventoryItem.create({
      data: {
        characterId: CHAR_ID,
        name: "Ring of Protection",
        category: "gear",
        quantity: 1,
        position: 1,
        requiresAttunement: true,
        armorDetail: { create: { armorCategory: "light", baseArmorClass: 11, dexModifierApplies: true, dexModifierMax: 4 } },
        consumableDetail: {
          create: { effectDiceCount: 2, effectDiceFaces: 4, effectModifier: 1, effectDescription: "Heals", maxUses: 3, usesRemaining: 2 },
        },
        capabilities: {
          create: [{ kind: "passiveBonus", target: "ac", op: "add", value: 1, condition: "while worn" }],
        },
      },
      include: { armorDetail: true, consumableDetail: true, capabilities: true },
    });

    await backfillInventorySnapshot(prisma);

    const row = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: created.id } });
    const parsed = inventorySnapshotSchema.parse(row.snapshot);

    expect(parsed.armor).toEqual({
      armorCategory: "light",
      baseArmorClass: 11,
      dexModifierApplies: true,
      dexModifierMax: 4,
      stealthDisadvantage: false,
      strengthRequirement: null,
    });
    // maxUses is the only frozen field — usesRemaining is the runtime counter
    // and must NOT appear (it now lives on InventoryItem.usesRemaining).
    expect(parsed.consumable).toEqual({
      effectDiceCount: 2,
      effectDiceFaces: 4,
      effectModifier: 1,
      effectDescription: "Heals",
      maxUses: 3,
    });
    expect(parsed.capabilities).toEqual([
      { key: created.capabilities[0].id, kind: "passiveBonus", target: "ac", op: "add", value: 1, targetKey: null, condition: "while worn", description: null, dice: null },
    ]);
  });

  it("leaves an already-backfilled row untouched", async () => {
    const created = await prisma.inventoryItem.create({
      data: { characterId: CHAR_ID, name: "Torch", category: "gear", quantity: 1, position: 2 },
    });
    await backfillInventorySnapshot(prisma);
    const first = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: created.id } });

    const second = await backfillInventorySnapshot(prisma);

    expect(second.backfilledItems).not.toContain(created.id);
    const row = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.snapshot).toEqual(first.snapshot);
  });

  // readPassiveBonusRow requires target+op; a row missing both reads as
  // OpaqueCapability, which the strict discriminated-union schema cannot
  // represent. The backfill must fail loudly on this row, not skip it — a
  // silently-skipped row becomes a null snapshot #1649 turns into a NOT NULL
  // violation, far from the cause.
  it("throws rather than silently skipping a row readCapability cannot represent", async () => {
    const created = await prisma.inventoryItem.create({
      data: {
        characterId: CHAR_ID,
        name: "Malformed Trinket",
        category: "gear",
        quantity: 1,
        position: 3,
        capabilities: { create: [{ kind: "passiveBonus" }] },
      },
    });

    await expect(backfillInventorySnapshot(prisma)).rejects.toThrow();

    const row = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.snapshot).toBeNull();
  });
});
