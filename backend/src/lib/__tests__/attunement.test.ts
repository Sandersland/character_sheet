import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";
import {
  applyInventoryOperations,
  AttunementLimitError,
  InvalidInventoryOperationError,
  inventoryItemDetailInclude,
  revertInventoryEvent,
} from "../inventory.js";

const OWNER_ID = "owner-attunement-lib";

const MINIMAL_CHARACTER = {
  name: "Attune Fixture",
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
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

async function makeItem(
  characterId: string,
  name: string,
  extra: Partial<Prisma.InventoryItemCreateInput> = {},
): Promise<string> {
  const row = await prisma.inventoryItem.create({
    data: {
      character: { connect: { id: characterId } },
      name,
      category: "gear",
      quantity: 1,
      ...extra,
    },
  });
  return row.id;
}

describe("attune / unattune operations (#545)", () => {
  let characterId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    const character = await prisma.character.create({
      data: {
        ...MINIMAL_CHARACTER,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        classEntries: { create: { name: "Wizard", level: 5, position: 0 } },
        raceSelection: { create: { name: "Elf" } },
      },
    });
    characterId = character.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: characterId } });
  });

  it("attunes an item, setting the flag and logging an undoable event", async () => {
    const itemId = await makeItem(characterId, "Cloak of Protection");
    await applyInventoryOperations(characterId, [{ type: "attune", inventoryItemId: itemId }]);

    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.attuned).toBe(true);

    const events = await prisma.characterEvent.findMany({ where: { characterId, type: "attuned" } });
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe("inventory");
    expect(events[0].entityId).toBe(itemId);
    expect(events[0].before).toEqual({ attuned: false });
  });

  it("unattunes and logs; a double-attune / double-unattune is rejected", async () => {
    const itemId = await makeItem(characterId, "Ring");
    await applyInventoryOperations(characterId, [{ type: "attune", inventoryItemId: itemId }]);

    await expect(
      applyInventoryOperations(characterId, [{ type: "attune", inventoryItemId: itemId }]),
    ).rejects.toThrow(InvalidInventoryOperationError);

    await applyInventoryOperations(characterId, [{ type: "unattune", inventoryItemId: itemId }]);
    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.attuned).toBe(false);
    expect(await prisma.characterEvent.count({ where: { characterId, type: "unattuned" } })).toBe(1);

    await expect(
      applyInventoryOperations(characterId, [{ type: "unattune", inventoryItemId: itemId }]),
    ).rejects.toThrow(InvalidInventoryOperationError);
  });

  it("rejects attuning a 4th item with a 409-bearing AttunementLimitError", async () => {
    const ids = await Promise.all(
      ["A", "B", "C", "D"].map((n) => makeItem(characterId, `Item ${n}`)),
    );
    for (const id of ids.slice(0, 3)) {
      await applyInventoryOperations(characterId, [{ type: "attune", inventoryItemId: id }]);
    }
    const err = await applyInventoryOperations(characterId, [{ type: "attune", inventoryItemId: ids[3] }]).catch((e) => e);
    expect(err).toBeInstanceOf(AttunementLimitError);
    expect((err as AttunementLimitError).status).toBe(409);
    // The rejected 4th item stays unattuned.
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: ids[3] } })).attuned).toBe(false);
  });

  it("blocks attune when a class/species/alignment prerequisite is unmet, with a clear error", async () => {
    const itemId = await makeItem(characterId, "Holy Avenger", {
      attunementPrereqKind: "class",
      attunementPrereqValue: "Paladin",
    });
    await expect(
      applyInventoryOperations(characterId, [{ type: "attune", inventoryItemId: itemId }]),
    ).rejects.toThrow(/requires attunement by a Paladin/);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).attuned).toBe(false);
  });

  it("allows attune when a spellcaster prerequisite is met (Wizard)", async () => {
    const itemId = await makeItem(characterId, "Staff of Power", {
      attunementPrereqKind: "spellcaster",
    });
    await applyInventoryOperations(characterId, [{ type: "attune", inventoryItemId: itemId }]);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).attuned).toBe(true);
  });

  it("reverts an attune (LIFO undo) back to unattuned with no residue", async () => {
    const itemId = await makeItem(characterId, "Amulet");
    await applyInventoryOperations(characterId, [{ type: "attune", inventoryItemId: itemId }]);
    const event = await prisma.characterEvent.findFirstOrThrow({ where: { characterId, type: "attuned" } });

    await prisma.$transaction((tx) => revertInventoryEvent(tx, characterId, event));

    const item = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: itemId },
      include: inventoryItemDetailInclude,
    });
    expect(item.attuned).toBe(false);
  });
});
