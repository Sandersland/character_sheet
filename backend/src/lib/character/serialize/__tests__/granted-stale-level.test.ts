import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";

const OWNER_ID = "owner-granted-stale";
const CHAR_ID = "test-granted-stale-1";
const MONK_CATALOG_NAME = "TestMonkStale";

let monkClassId: string;
let shadowId: string;

async function serialize(id: string) {
  const row = await prisma.character.findUniqueOrThrow({ where: { id }, include: characterInclude });
  return serializeCharacter(row);
}

describe("granted-only path uses XP-derived level for single-class (#1019)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: MONK_CATALOG_NAME },
      create: {
        name: MONK_CATALOG_NAME, hitDie: "d8",
        savingThrows: ["strength", "dexterity"], skillChoiceCount: 2,
        skillChoices: ["acrobatics", "stealth"], isSpellcaster: false, subclassLevel: 3,
      },
      update: {},
    });
    monkClassId = cls.id;
    const shadow = await prisma.subclass.upsert({
      where: { classId_name: { classId: monkClassId, name: "Warrior of Shadow" } },
      create: { classId: monkClassId, name: "Warrior of Shadow", description: "Test subclass" },
      update: {},
    });
    shadowId = shadow.id;
    const minorIllusion = await prisma.spell.findUnique({ where: { name: "Minor Illusion" }, select: { id: true } });
    if (!minorIllusion) throw new Error("Minor Illusion not seeded — run `prisma db seed` before tests");
    await prisma.subclassGrantedSpell.upsert({
      where: { subclassId_spellId: { subclassId: shadow.id, spellId: minorIllusion.id } },
      create: { subclassId: shadow.id, spellId: minorIllusion.id, gateLevel: 3, castingAbility: "wisdom" },
      update: { gateLevel: 3, castingAbility: "wisdom" },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: CHAR_ID } });
  });

  it("surfaces the L3 grant when entry.level is stale-low but XP-derived level meets the gate", async () => {
    await prisma.character.create({
      data: {
        id: CHAR_ID,
        name: "Stale Shadow Monk",
        alignment: "Lawful Neutral",
        experiencePoints: 900, // levelForExperience(900) = 3
        initiativeBonus: 0,
        speed: 30,
        hitPoints: { current: 20, max: 20, temp: 0 },
        hitDice: { total: 3, die: "d8" },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 15, charisma: 8 },
        savingThrowProficiencies: ["strength", "dexterity"],
        skills: [], toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        ownerId: OWNER_ID,
        spellcasting: { slotsUsed: {}, spells: [] } as Prisma.InputJsonValue,
        classEntries: {
          // Stale-low per-class level (2) below the XP-derived total (3). The
          // granted-only path must gate on the XP-derived level, not entry.level.
          create: [{ name: "monk", classId: monkClassId, position: 0, level: 2, subclass: "Warrior of Shadow", subclassId: shadowId }],
        },
      },
    });
    const view = await serialize(CHAR_ID) as { spellcasting?: { spells?: Array<{ name: string; source?: string }> } };
    const minor = (view.spellcasting?.spells ?? []).find((s) => s.name === "Minor Illusion");
    expect(minor).toBeDefined();
    expect(minor!.source).toBe("subclass");
  });
});
