import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";
import { characterInclude } from "../character-include.js";
import { serializeCharacter } from "../character-serialize.js";

const OWNER_ID = "owner-serialize-passive";

const BASE_CHAR = {
  name: "Passive Fixture",
  alignment: "Lawful Good",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [{ name: "stealth", ability: "dexterity", proficient: false }],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

async function serialize(characterId: string) {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: characterInclude });
  return serializeCharacter(row);
}

function stealth(view: Awaited<ReturnType<typeof serialize>>) {
  return view.skills.find((s) => s.name === "stealth") as { tempModifier?: number; tempModifierSources?: { label: string; value: number }[] };
}

describe("serialize sums active-item scalar passiveBonus into tempModifier (#545)", () => {
  let characterId: string;
  let itemId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    const character = await prisma.character.create({
      data: {
        ...BASE_CHAR,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        classEntries: { create: { name: "Rogue", level: 3, position: 0 } },
      },
    });
    characterId = character.id;

    const item = await prisma.inventoryItem.create({
      data: {
        character: { connect: { id: characterId } },
        name: "Cloak of Elvenkind",
        category: "gear",
        quantity: 1,
        equipped: false,
        capabilities: {
          create: [{ kind: "passiveBonus", target: "skill", op: "add", value: 2, targetKey: "stealth" }],
        },
      },
    });
    itemId = item.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: characterId } });
  });

  it("omits the bonus while the item is inactive (not equipped/attuned)", async () => {
    const view = await serialize(characterId);
    expect(stealth(view).tempModifier).toBeUndefined();
  });

  it("surfaces the snapshotted requiresAttunement flag on the serialized item (#545)", async () => {
    const attunable = await prisma.inventoryItem.create({
      data: {
        character: { connect: { id: characterId } },
        name: "Ring of Protection",
        category: "gear",
        quantity: 1,
        requiresAttunement: true,
      },
    });
    const view = await serialize(characterId);
    const ring = view.inventory.find((i) => i.id === attunable.id);
    expect(ring?.requiresAttunement).toBe(true);
    // A plain item (no flag) reports false, not undefined — a reliable frontend signal.
    const cloak = view.inventory.find((i) => i.id === itemId);
    expect(cloak?.requiresAttunement).toBe(false);
  });

  it("exposes the item's capabilities on the serialized inventory row (#546)", async () => {
    const view = await serialize(characterId);
    const cloak = view.inventory.find((i) => i.id === itemId);
    expect(cloak?.capabilities).toEqual([
      { kind: "passiveBonus", target: "skill", op: "add", value: 2, targetKey: "stealth" },
    ]);
    // A plain item carries no capabilities key at all.
    const bare = await prisma.inventoryItem.create({
      data: { character: { connect: { id: characterId } }, name: "Torch", category: "gear", quantity: 1 },
    });
    const reloaded = await serialize(characterId);
    expect(reloaded.inventory.find((i) => i.id === bare.id)?.capabilities).toBeUndefined();
  });

  it("applies the bonus while equipped, with a labeled source", async () => {
    await prisma.inventoryItem.update({ where: { id: itemId }, data: { equipped: true } });
    const view = await serialize(characterId);
    expect(stealth(view).tempModifier).toBe(2);
    expect(stealth(view).tempModifierSources).toEqual([{ label: "Cloak of Elvenkind", value: 2 }]);
  });

  it("applies the bonus while attuned (not equipped) and drops it on unattune with no residue", async () => {
    await prisma.inventoryItem.update({ where: { id: itemId }, data: { attuned: true } });
    expect(stealth(await serialize(characterId)).tempModifier).toBe(2);

    await prisma.inventoryItem.update({ where: { id: itemId }, data: { attuned: false } });
    expect(stealth(await serialize(characterId)).tempModifier).toBeUndefined();
    // No ActiveBuff persisted — the bonus is derived purely from the item.
    const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect(row.activeEffects).toBeNull();
  });
});
