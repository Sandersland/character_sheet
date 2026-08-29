// deriveRestPools/restoreWarlockPactSlots must read pools across ALL class entries, not just the primary (#1072).
import { afterEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { applyHitPointOperations } from "@/lib/combat/hitpoints.js";

const OWNER_ID = "owner-rest-multiclass-1072";

const BASE_CHAR = {
  alignment: "Neutral",
  initiativeBonus: 0,
  speed: 30,
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

async function readRow(characterId: string) {
  return prisma.character.findUniqueOrThrow({ where: { id: characterId } });
}

describe("rest recharge reads all class entries, not just primary (#1072)", () => {
  const MONK_FIGHTER_ID = "test-rest-monk-fighter-1072";
  const SORCERER_WARLOCK_ID = "test-rest-sorcerer-warlock-1072";

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: { in: [MONK_FIGHTER_ID, SORCERER_WARLOCK_ID] } } });
  });

  it("Monk 5 / Fighter (Battle Master) 3 short-rests: focus refills to 5 AND superiority dice refill to 4", async () => {
    await ensureTestOwner(OWNER_ID);
    const monkId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Monk" } })).id;
    const fighterId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } })).id;
    const battleMasterId = (await prisma.subclass.findFirstOrThrow({ where: { classId: fighterId, name: "Battle Master" } })).id;
    await prisma.character.create({
      data: {
        ...BASE_CHAR,
        id: MONK_FIGHTER_ID,
        name: "Rest Multiclass Monk/Fighter",
        ownerId: OWNER_ID,
        experiencePoints: 34000,
        hitPoints: { current: 10, max: 50, temp: 0 },
        hitDice: { total: 8, die: "d8", spent: 0 },
        abilityScores: { strength: 14, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 13, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        resources: { used: { focus: 5, superiorityDice: 4 } } as Prisma.InputJsonValue,
        classEntries: {
          create: [
            { name: "monk", classId: monkId, position: 0, level: 5 },
            { name: "fighter", subclass: "battle master", subclassId: battleMasterId, classId: fighterId, position: 1, level: 3 },
          ],
        },
      },
    });

    await applyHitPointOperations(MONK_FIGHTER_ID, [{ type: "shortRest", rolls: [4] }]);

    const row = await readRow(MONK_FIGHTER_ID);
    const used = (row.resources as { used: Record<string, number> }).used;
    expect(used.focus ?? 0).toBe(0);
    expect(used.superiorityDice ?? 0).toBe(0);
  });

  it("Sorcerer 2 / Warlock 5 short-rests: secondary-class Warlock's Pact slots restore; sorcerer's own slots + concentration untouched", async () => {
    await ensureTestOwner(OWNER_ID);
    await prisma.character.create({
      data: {
        ...BASE_CHAR,
        id: SORCERER_WARLOCK_ID,
        name: "Rest Multiclass Sorcerer/Warlock",
        ownerId: OWNER_ID,
        experiencePoints: 23000,
        hitPoints: { current: 10, max: 40, temp: 0 },
        hitDice: { total: 7, die: "d8", spent: 0 },
        abilityScores: { strength: 10, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 10, charisma: 16 },
        // Slot level 1 (sorcerer) and 3 (warlock Pact) are deliberately distinct so this fixture can't collide on a shared key.
        spellcasting: {
          slotsUsed: { "1": 2, "3": 2 },
          arcanumUsed: {},
          spells: [],
          concentratingOn: { entryId: "conc-1072", spellName: "Test Spell" },
        } as unknown as Prisma.InputJsonValue,
        classEntries: {
          create: [
            { name: "sorcerer", position: 0, level: 2 },
            { name: "warlock", position: 1, level: 5 },
          ],
        },
      },
    });

    await applyHitPointOperations(SORCERER_WARLOCK_ID, [{ type: "shortRest", rolls: [4] }]);

    const row = await readRow(SORCERER_WARLOCK_ID);
    const spellcasting = row.spellcasting as {
      slotsUsed: Record<string, number>;
      concentratingOn: unknown;
    };
    expect(spellcasting.slotsUsed["3"] ?? 0).toBe(0);
    expect(spellcasting.slotsUsed["1"]).toBe(2);
    expect(spellcasting.concentratingOn).toEqual({ entryId: "conc-1072", spellName: "Test Spell" });
  });
});
