import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";
import { applyHitPointOperations, normalizeHitPoints } from "../hitpoints.js";

const OWNER_ID = "owner-hp-item-resist";

const BASE_CHAR = {
  name: "Resist Fixture",
  alignment: "Lawful Good",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 30, max: 30, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

async function current(characterId: string) {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
  return normalizeHitPoints(row.hitPoints).current;
}

describe("item-granted resistance halves damage via #456 flow (#529)", () => {
  let characterId: string;
  let ringId: string;

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
    const ring = await prisma.inventoryItem.create({
      data: {
        character: { connect: { id: characterId } },
        name: "Ring of Fire Resistance",
        category: "gear",
        quantity: 1,
        requiresAttunement: true,
        capabilities: {
          create: [{ kind: "grant", grantType: "resistance", grantValueKind: "damageType", grantValue: "fire" }],
        },
      },
    });
    ringId = ring.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: characterId } });
  });

  it("does not halve while the ring is unattuned", async () => {
    await applyHitPointOperations(characterId, [{ type: "damage", amount: 10, damageType: "fire" }]);
    expect(await current(characterId)).toBe(20);
  });

  it("halves matching fire damage while attuned", async () => {
    await prisma.inventoryItem.update({ where: { id: ringId }, data: { attuned: true } });
    await applyHitPointOperations(characterId, [{ type: "damage", amount: 10, damageType: "fire" }]);
    expect(await current(characterId)).toBe(25);
  });

  it("leaves a non-matching damage type at full", async () => {
    await prisma.inventoryItem.update({ where: { id: ringId }, data: { attuned: true } });
    await applyHitPointOperations(characterId, [{ type: "damage", amount: 10, damageType: "cold" }]);
    expect(await current(characterId)).toBe(20);
  });

  it("stops halving once unattuned (no residue)", async () => {
    await prisma.inventoryItem.update({ where: { id: ringId }, data: { attuned: true } });
    await prisma.inventoryItem.update({ where: { id: ringId }, data: { attuned: false } });
    await applyHitPointOperations(characterId, [{ type: "damage", amount: 10, damageType: "fire" }]);
    expect(await current(characterId)).toBe(20);
  });
});
