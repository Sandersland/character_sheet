/**
 * AC-granting spells (#363) — drives the real cast → serialize path against
 * Postgres for the three PHB shapes: flat +N (Shield of Faith), unarmored base
 * override (Mage Armor), and AC floor (Barkskin). Also covers the Mage Armor
 * true-end hooks (don body armor / dismiss / long rest). Requires DATABASE_URL.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
import { applySpellcastingOperations } from "@/lib/spellcasting/spellcasting.js";
import { applyInventoryOperations } from "@/lib/inventory/inventory.js";
import { applyHitPointOperations } from "@/lib/combat/hitpoints.js";

const OWNER_ID = "owner-ac-spells";

// Wizard L3 (900 XP) → level-1 and level-2 slots; unarmored Dex 14 (+2) → AC 12.
const BASE_CHAR = {
  name: "AC Spell Caster",
  alignment: "Neutral",
  experiencePoints: 900,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 20, max: 20, temp: 0 },
  hitDice: { total: 3, die: "d6" },
  abilityScores: { strength: 10, dexterity: 14, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

let characterId: string;

async function serialize() {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: characterInclude });
  return serializeCharacter(row);
}

async function entryIdForSpell(spellId: string): Promise<string> {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, select: { spellcasting: true } });
  const sc = row.spellcasting as { spells?: Array<{ id: string; spellId?: string }> };
  return sc.spells!.find((s) => s.spellId === spellId)!.id;
}

// Learn a catalog spell by name and (optionally) cast it at its base level.
async function learnAndCast(spellName: string, cast = true): Promise<string> {
  const spell = await prisma.spell.findUniqueOrThrow({ where: { name: spellName } });
  await applySpellcastingOperations(characterId, [{ type: "learnSpell", spellId: spell.id }], OWNER_ID);
  const entryId = await entryIdForSpell(spell.id);
  if (cast) await applySpellcastingOperations(characterId, [{ type: "castSpell", entryId, roll: 0 }], OWNER_ID);
  return entryId;
}

async function makeBodyArmor(over: { name?: string; armorCategory?: "light" | "medium" | "heavy"; baseArmorClass?: number; dexModifierMax?: number } = {}) {
  return prisma.inventoryItem.create({
    data: {
      character: { connect: { id: characterId } },
      name: over.name ?? "Leather Armor",
      category: "armor",
      quantity: 1,
      armorDetail: {
        create: {
          armorCategory: over.armorCategory ?? "light",
          baseArmorClass: over.baseArmorClass ?? 11,
          dexModifierApplies: (over.armorCategory ?? "light") !== "heavy",
          ...(over.dexModifierMax != null ? { dexModifierMax: over.dexModifierMax } : {}),
        },
      },
    },
  });
}

describe("AC-granting spells (#363)", () => {
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
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { ownerId: OWNER_ID } });
  });

  it("baseline unarmored AC is 10 + Dex", async () => {
    expect((await serialize()).armorClass).toBe(12);
  });

  it("Shield of Faith adds a labeled +2, dropping when concentration ends", async () => {
    await learnAndCast("Shield of Faith");
    const view = await serialize();
    expect(view.armorClass).toBe(14);
    expect(view.armorClassBreakdown).toContainEqual({ label: "Shield of Faith", value: 2 });

    await applySpellcastingOperations(characterId, [{ type: "dropConcentration" }], OWNER_ID);
    expect((await serialize()).armorClass).toBe(12);
  });

  it("Mage Armor sets the unarmored base to 13 + Dex; dismiss reverts it", async () => {
    const entryId = await learnAndCast("Mage Armor");
    const view = await serialize();
    expect(view.armorClass).toBe(15); // 13 + Dex 2
    expect(view.armorClassBreakdown).toEqual(
      expect.arrayContaining([{ label: "Mage Armor", value: 13 }, { label: "Dex", value: 2 }]),
    );
    // No "Unarmored 10" base line survives — Mage Armor replaced it.
    expect(view.armorClassBreakdown.some((p) => p.label === "Unarmored")).toBe(false);

    await applySpellcastingOperations(characterId, [{ type: "dismissBuff", entryId }], OWNER_ID);
    expect((await serialize()).armorClass).toBe(12);
  });

  it("donning body armor true-ends Mage Armor (must recast)", async () => {
    await learnAndCast("Mage Armor");
    expect((await serialize()).armorClass).toBe(15);

    const armor = await makeBodyArmor(); // leather 11 + Dex 2 = 13
    await applyInventoryOperations(characterId, [{ type: "equip", inventoryItemId: armor.id, slot: "BODY" }]);
    expect((await serialize()).armorClass).toBe(13); // Mage Armor gone, armor rules apply

    // Removing the armor does NOT bring Mage Armor back — it truly ended.
    await applyInventoryOperations(characterId, [{ type: "setEquipped", inventoryItemId: armor.id, equipped: false }]);
    expect((await serialize()).armorClass).toBe(12);
  });

  it("a long rest ends Mage Armor (while-active buff)", async () => {
    await learnAndCast("Mage Armor");
    expect((await serialize()).armorClass).toBe(15);
    await applyHitPointOperations(characterId, [{ type: "longRest" }]);
    expect((await serialize()).armorClass).toBe(12);
  });

  it("Barkskin floors AC at 16 while unarmored, as a reconciling breakdown part", async () => {
    await learnAndCast("Barkskin");
    const view = await serialize();
    expect(view.armorClass).toBe(16); // unarmored 12 floored up to 16
    expect(view.armorClassBreakdown).toContainEqual({ label: "Barkskin (floor 16)", value: 4 });
    // Single-source-of-sum invariant: labeled parts sum to armorClass.
    expect(view.armorClassBreakdown.reduce((t, p) => t + p.value, 0)).toBe(16);

    await applySpellcastingOperations(characterId, [{ type: "dropConcentration" }], OWNER_ID);
    expect((await serialize()).armorClass).toBe(12);
  });

  it("Barkskin adds a 0-value reminder when AC already meets the floor", async () => {
    // Half plate 15 + Dex 2 (cap 2) = 17, already ≥ 16.
    const armor = await makeBodyArmor({ name: "Half Plate", armorCategory: "medium", baseArmorClass: 15, dexModifierMax: 2 });
    await applyInventoryOperations(characterId, [{ type: "equip", inventoryItemId: armor.id, slot: "BODY" }]);
    await learnAndCast("Barkskin");

    const view = await serialize();
    expect(view.armorClass).toBe(17); // floor doesn't raise AC
    expect(view.armorClassBreakdown).toContainEqual({ label: "Barkskin", value: 0, reminder: "floor 16" });
    expect(view.armorClassBreakdown.reduce((t, p) => t + p.value, 0)).toBe(17);
  });
});
