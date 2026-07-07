import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";
import { characterInclude } from "../character-include.js";
import { serializeCharacter } from "../character-serialize.js";
import type { SpellEntry } from "../spell-state.js";

const OWNER_ID = "owner-serialize-item-cast";

const BASE_CHAR = {
  name: "Item Caster Fixture",
  alignment: "Lawful Good",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d12" },
  abilityScores: { strength: 14, dexterity: 10, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

const CAST_WITCH_BOLT = {
  kind: "castSpell" as const,
  spellId: "spell-witch-bolt",
  spellName: "Witch Bolt",
  spellLevel: 1,
  castLevel: 1,
  castResource: "perRestShort" as const,
  castUses: 1,
  castConcentration: true,
  dcMode: "fixed" as const,
  dcValue: 15,
  attackMode: "fixed" as const,
  attackValue: 7,
};

async function serialize(characterId: string) {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: characterInclude });
  return serializeCharacter(row);
}

function itemSpells(view: Awaited<ReturnType<typeof serialize>>): SpellEntry[] {
  const sc = view.spellcasting as { spells?: SpellEntry[] } | undefined;
  return (sc?.spells ?? []).filter((s) => s.source === "item");
}

describe("serialize surfaces item-granted spells (#528)", () => {
  let characterId: string;
  let itemId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    const character = await prisma.character.create({
      data: {
        ...BASE_CHAR,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        // A pure non-caster — proves item spells surface with no caster class.
        classEntries: { create: { name: "Barbarian", level: 3, position: 0 } },
      },
    });
    characterId = character.id;

    const item = await prisma.inventoryItem.create({
      data: {
        character: { connect: { id: characterId } },
        name: "Wand of Witch Bolt",
        category: "gear",
        quantity: 1,
        requiresAttunement: true,
        attuned: false,
        capabilities: { create: [CAST_WITCH_BOLT] },
      },
    });
    itemId = item.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: characterId } });
  });

  it("omits the item spell while the item is inactive (not equipped/attuned)", async () => {
    const view = await serialize(characterId);
    expect(itemSpells(view)).toEqual([]);
  });

  it("surfaces the item spell with fixed DC + full uses while attuned", async () => {
    await prisma.inventoryItem.update({ where: { id: itemId }, data: { attuned: true } });
    const [spell] = itemSpells(await serialize(characterId));
    expect(spell).toBeDefined();
    // Entry id carries the capability id suffix so two castSpell caps for the
    // same spell on one item stay distinct (#528 review fix).
    expect(spell.id).toBe(`item:${itemId}:spell-witch-bolt:${spell.item?.capabilityId}`);
    expect(spell.name).toBe("Witch Bolt");
    expect(spell.level).toBe(1);
    expect(spell.concentration).toBe(true);
    expect(spell.item).toMatchObject({
      inventoryItemId: itemId,
      itemName: "Wand of Witch Bolt",
      dcMode: "fixed",
      dc: 15,
      attackMode: "fixed",
      attack: 7,
      usesRemaining: 1,
      usesTotal: 1,
    });
  });

  it("reflects a spent use in usesRemaining", async () => {
    await prisma.inventoryItem.update({ where: { id: itemId }, data: { attuned: true } });
    await prisma.inventoryCapability.updateMany({ where: { inventoryItemId: itemId }, data: { used: 1 } });
    const [spell] = itemSpells(await serialize(characterId));
    expect(spell.item?.usesRemaining).toBe(0);
    expect(spell.item?.usesTotal).toBe(1);
  });

  it("drops the item spell on unattune with no residue", async () => {
    await prisma.inventoryItem.update({ where: { id: itemId }, data: { attuned: true } });
    expect(itemSpells(await serialize(characterId))).toHaveLength(1);
    await prisma.inventoryItem.update({ where: { id: itemId }, data: { attuned: false } });
    expect(itemSpells(await serialize(characterId))).toEqual([]);
  });
});
