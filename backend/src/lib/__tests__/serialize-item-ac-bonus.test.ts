import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";
import { characterInclude } from "../character-include.js";
import { serializeCharacter } from "../character-serialize.js";

const OWNER_ID = "owner-serialize-ac-bonus";

const BASE_CHAR = {
  name: "AC Fixture",
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

describe("serialize applies active-item AC passiveBonus into armorClassBreakdown (#383)", () => {
  let characterId: string;
  let ringId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    const character = await prisma.character.create({
      data: {
        ...BASE_CHAR,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        classEntries: { create: { name: "Wizard", level: 3, position: 0 } },
      },
    });
    characterId = character.id;

    const ring = await prisma.inventoryItem.create({
      data: {
        character: { connect: { id: characterId } },
        name: "Ring of Protection",
        category: "gear",
        quantity: 1,
        requiresAttunement: true,
        capabilities: { create: [{ kind: "passiveBonus", target: "ac", op: "add", value: 1 }] },
      },
    });
    ringId = ring.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: characterId } });
  });

  it("omits the AC bonus while the item is inactive (not equipped/attuned)", async () => {
    const view = await serialize(characterId);
    // Unarmored Dex 10 → AC 10, no Ring line.
    expect(view.armorClass).toBe(10);
    expect(view.armorClassBreakdown.some((p) => p.label === "Ring of Protection")).toBe(false);
  });

  it("raises AC by 1 with a labeled breakdown line while attuned", async () => {
    await prisma.inventoryItem.update({ where: { id: ringId }, data: { attuned: true } });
    const view = await serialize(characterId);
    expect(view.armorClass).toBe(11);
    expect(view.armorClassBreakdown).toContainEqual({ label: "Ring of Protection", value: 1 });
  });

  it("drops the AC bonus on unattune with no residue (derive-don't-persist)", async () => {
    await prisma.inventoryItem.update({ where: { id: ringId }, data: { attuned: true } });
    expect((await serialize(characterId)).armorClass).toBe(11);

    await prisma.inventoryItem.update({ where: { id: ringId }, data: { attuned: false } });
    const view = await serialize(characterId);
    expect(view.armorClass).toBe(10);
    expect(view.armorClassBreakdown.some((p) => p.label === "Ring of Protection")).toBe(false);
    const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect(row.activeEffects).toBeNull();
  });

  it("stacks with armor + Dex + shield (single-source sum preserved)", async () => {
    await prisma.inventoryItem.update({ where: { id: ringId }, data: { attuned: true } });
    // Chain Shirt (medium, base 13, Dex cap +2) + shield, Dex 10.
    await prisma.inventoryItem.create({
      data: {
        character: { connect: { id: characterId } },
        name: "Chain Shirt",
        category: "armor",
        quantity: 1,
        equipped: true,
        armorDetail: { create: { armorCategory: "medium", baseArmorClass: 13, dexModifierApplies: true, dexModifierMax: 2 } },
      },
    });
    await prisma.inventoryItem.create({
      data: {
        character: { connect: { id: characterId } },
        name: "Shield",
        category: "armor",
        quantity: 1,
        equipped: true,
        armorDetail: { create: { armorCategory: "shield", baseArmorClass: 2 } },
      },
    });
    const view = await serialize(characterId);
    // 13 armor + 0 Dex + 2 shield + 1 ring = 16, and the sum equals the breakdown total.
    expect(view.armorClass).toBe(16);
    expect(view.armorClass).toBe(view.armorClassBreakdown.reduce((t, p) => t + p.value, 0));
    expect(view.armorClassBreakdown).toContainEqual({ label: "Ring of Protection", value: 1 });
  });

  it("surfaces a conditional AC bonus as reminder text, not applied to the total", async () => {
    await prisma.inventoryItem.create({
      data: {
        character: { connect: { id: characterId } },
        name: "Bracers of Defense",
        category: "gear",
        quantity: 1,
        attuned: true,
        capabilities: {
          create: [{ kind: "passiveBonus", target: "ac", op: "add", value: 2, condition: "while wearing no armor and no shield" }],
        },
      },
    });
    const view = await serialize(characterId);
    // Bonus not applied (still unarmored AC 10); condition shown as reminder.
    expect(view.armorClass).toBe(10);
    expect(view.armorClassBreakdown).toContainEqual({
      label: "Bracers of Defense",
      value: 0,
      reminder: "while wearing no armor and no shield",
    });
  });
});
