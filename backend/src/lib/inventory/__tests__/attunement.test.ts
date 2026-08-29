import { readFile } from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import {
  applyInventoryOperations,
  AttunementLimitError,
  InvalidInventoryOperationError,
  inventoryItemDetailInclude,
  revertInventoryEvent,
} from "@/lib/inventory/inventory.js";
import { inventoryItemFixtureData, type InventoryItemFixtureInput } from "@/test-support/inventory-snapshot-fixture.js";

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
  extra: Partial<Omit<InventoryItemFixtureInput, "characterId" | "name" | "category">> = {},
): Promise<string> {
  const row = await prisma.inventoryItem.create({
    data: inventoryItemFixtureData({ characterId, name, category: "gear", ...extra }),
  });
  return row.id;
}

// #1377: the served `attunementCap` and the 409 threshold must resolve to ONE constant; checked structurally since a behavioral test can't distinguish two independent 3s.
describe("ATTUNEMENT_LIMIT is the file's only 3", () => {
  it("has exactly one numeric 3 outside comments", async () => {
    const source = await readFile(
      new URL("../inventory-attunement.ts", import.meta.url),
      "utf8",
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code.match(/\b3\b/g)).toHaveLength(1);
  });
});

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
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: ids[3] } })).attuned).toBe(false);
  });

  // TOCTOU regression (#1888): concurrent attunes must serialize inside the transaction lock, or both can read a pre-write count under ATTUNEMENT_LIMIT and commit past the cap.
  it("attuning two items concurrently at 1-away-from-cap never exceeds the 3-item cap", async () => {
    const [already1, already2, b, c] = await Promise.all(
      ["Already 1", "Already 2", "B", "C"].map((n) => makeItem(characterId, `Item ${n}`)),
    );
    await applyInventoryOperations(characterId, [{ type: "attune", inventoryItemId: already1 }]);
    await applyInventoryOperations(characterId, [{ type: "attune", inventoryItemId: already2 }]);

    const results = await Promise.allSettled([
      applyInventoryOperations(characterId, [{ type: "attune", inventoryItemId: b }]),
      applyInventoryOperations(characterId, [{ type: "attune", inventoryItemId: c }]),
    ]);

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual(["fulfilled", "rejected"]);

    const attunedCount = await prisma.inventoryItem.count({ where: { characterId, attuned: true } });
    expect(attunedCount).toBe(3);
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

  // #1684: species prereq resolves via raceSelection.speciesId/variantId, not the free-text raceSelection.name.
  it("resolves a species prerequisite against a real speciesId/variantId-anchored character (variant name wins)", async () => {
    const dwarf = await prisma.species.findFirstOrThrow({
      where: { slug: "dwarf", edition: "EDITION_2014" },
      include: { variants: true },
    });
    const hillDwarf = dwarf.variants.find((v) => v.slug === "hill")!;
    const speciesCharacter = await prisma.character.create({
      data: {
        ...MINIMAL_CHARACTER,
        name: "Species Attune Fixture",
        ownerId: OWNER_ID,
        rulesEdition: "EDITION_2014",
        spellcasting: Prisma.JsonNull,
        classEntries: { create: { name: "Fighter", level: 1, position: 0 } },
        raceSelection: {
          create: { name: hillDwarf.name, speciesId: dwarf.id, variantId: hillDwarf.id, variantName: hillDwarf.name },
        },
      },
    });

    const itemId = await makeItem(speciesCharacter.id, "Axe of the Dwarvish Lords", {
      attunementPrereqKind: "species",
      attunementPrereqValue: "Hill Dwarf",
    });
    await applyInventoryOperations(speciesCharacter.id, [{ type: "attune", inventoryItemId: itemId }]);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).attuned).toBe(true);

    // A prerequisite pinned to the variant name must not match the parent species' own name.
    const wrongItemId = await makeItem(speciesCharacter.id, "Axe of Generic Dwarves", {
      attunementPrereqKind: "species",
      attunementPrereqValue: "Dwarf",
    });
    await expect(
      applyInventoryOperations(speciesCharacter.id, [{ type: "attune", inventoryItemId: wrongItemId }]),
    ).rejects.toThrow(/requires attunement by a Dwarf/);

    await prisma.character.deleteMany({ where: { id: speciesCharacter.id } });
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
