import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { characterInclude } from "@/lib/character-include.js";
import { serializeCharacter } from "@/lib/character-serialize.js";

const OWNER_ID = "owner-serialize-grants";

const BASE_CHAR = {
  name: "Grant Fixture",
  alignment: "Lawful Good",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [{ name: "perception", ability: "wisdom", proficient: false }],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

async function serialize(characterId: string) {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: characterInclude });
  return serializeCharacter(row);
}

describe("serialize derives item grants (#529)", () => {
  let characterId: string;
  let ringId: string;

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

    const ring = await prisma.inventoryItem.create({
      data: {
        character: { connect: { id: characterId } },
        name: "Ring of Fire Resistance",
        category: "gear",
        quantity: 1,
        requiresAttunement: true,
        capabilities: {
          create: [
            { kind: "grant", grantType: "resistance", grantValueKind: "damageType", grantValue: "fire" },
            { kind: "grant", grantType: "proficiency", grantValueKind: "skill", grantValue: "perception" },
            { kind: "grant", grantType: "advantage", grantOn: "initiative", cantBeSurprised: true },
            { kind: "grant", grantType: "conditionImmunity", grantValueKind: "condition", grantValue: "poisoned" },
          ],
        },
      },
    });
    ringId = ring.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: characterId } });
  });

  it("omits all grants while the attunement item is unattuned", async () => {
    const view = await serialize(characterId);
    expect(view.resistances).toEqual([]);
    expect(view.conditionImmunities).toEqual([]);
    expect(view.grantedAdvantages).toEqual([]);
    expect(view.skills.find((s) => s.name === "perception")?.proficient).toBe(false);
  });

  it("surfaces resistances, condition immunities, advantages and skill proficiency while attuned", async () => {
    await prisma.inventoryItem.update({ where: { id: ringId }, data: { attuned: true } });
    const view = await serialize(characterId);
    expect(view.resistances).toEqual([{ damageType: "fire", source: "Ring of Fire Resistance" }]);
    expect(view.conditionImmunities).toEqual([{ condition: "poisoned", source: "Ring of Fire Resistance" }]);
    expect(view.grantedAdvantages).toEqual([
      { on: "initiative", cantBeSurprised: true, source: "Ring of Fire Resistance" },
    ]);
    // Item skill proficiency flips the derived proficient flag (affects modifier).
    expect(view.skills.find((s) => s.name === "perception")?.proficient).toBe(true);
  });

  it("drops every grant on unattune with no residue", async () => {
    await prisma.inventoryItem.update({ where: { id: ringId }, data: { attuned: true } });
    await prisma.inventoryItem.update({ where: { id: ringId }, data: { attuned: false } });
    const view = await serialize(characterId);
    expect(view.resistances).toEqual([]);
    expect(view.conditionImmunities).toEqual([]);
    expect(view.grantedAdvantages).toEqual([]);
    expect(view.skills.find((s) => s.name === "perception")?.proficient).toBe(false);
    // Nothing persisted — grants are purely derived.
    const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect(row.activeEffects).toBeNull();
  });

  it("merges an item weapon proficiency tagged source item while active", async () => {
    await prisma.inventoryItem.create({
      data: {
        character: { connect: { id: characterId } },
        name: "Greataxe of Training",
        category: "weapon",
        quantity: 1,
        equippedSlot: "MAIN_HAND",
        capabilities: {
          create: [{ kind: "grant", grantType: "proficiency", grantValueKind: "weapon", grantValue: "Greataxes" }],
        },
      },
    });
    const view = await serialize(characterId);
    // Rogue lacks Greataxes, so the item grant surfaces with source "item".
    expect(view.weaponProficiencies.some((w) => w.name === "Greataxes" && w.source === "item")).toBe(true);
    expect(view.grantedProficiencies).toContainEqual({ profType: "weapon", value: "Greataxes", source: "Greataxe of Training" });
  });
});
