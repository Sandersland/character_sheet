// Integration test for #1071 chunk 2: confirms the entry-scoped pool layer
// (deriveEntryScopedResources) flows all the way through serializeCharacter's
// resources.pools wire payload, and that a secondary class's pool shrinks via
// the existing clamp-on-read (buildResourcesPayload) after a level-down — no
// new reconciler needed since pool totals are derived, never persisted.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";

const OWNER_ID = "owner-entry-scoped-pools";
const CHAR_ID = "test-entry-scoped-pools-1";

async function serialize(id: string) {
  const row = await prisma.character.findUniqueOrThrow({ where: { id }, include: characterInclude });
  return serializeCharacter(row) as {
    resources?: { pools: { key: string; total: number; used: number; remaining: number }[] };
  };
}

describe("entry-scoped resource pools flow through serializeCharacter (#1071)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: CHAR_ID } });
  });

  it("Monk 5 / Fighter (Battle Master) 3: resources.pools has ki=5 AND superiorityDice=4 simultaneously", async () => {
    await prisma.character.create({
      data: {
        id: CHAR_ID,
        name: "Multiclass Pool Fixture",
        alignment: "Neutral",
        experiencePoints: 34000, // levelForExperience(34000) = 8 (monk 5 + fighter 3)
        initiativeBonus: 0,
        speed: 30,
        hitPoints: { current: 50, max: 50, temp: 0 },
        hitDice: { total: 8, die: "d8" },
        abilityScores: { strength: 14, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 13, charisma: 10 },
        savingThrowProficiencies: [],
        skills: [],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        resources: { used: { ki: 5, superiorityDice: 4 } } as Prisma.InputJsonValue,
        classEntries: {
          create: [
            { name: "monk", position: 0, level: 5 },
            { name: "fighter", position: 1, level: 3, subclass: "battle master" },
          ],
        },
      },
    });

    const view = await serialize(CHAR_ID);
    const pools = view.resources?.pools ?? [];

    const ki = pools.find((p) => p.key === "ki");
    expect(ki).toMatchObject({ total: 5, used: 5, remaining: 0 });

    const superiorityDice = pools.find((p) => p.key === "superiorityDice");
    expect(superiorityDice).toMatchObject({ total: 4, used: 4, remaining: 0 });

    // Fighter's own base-class pools appear too (secondWind, actionSurge at L3).
    expect(pools.find((p) => p.key === "secondWind")).toBeDefined();
    expect(pools.find((p) => p.key === "actionSurge")).toBeDefined();
  });

  it("leveling the secondary monk entry down shrinks its ki pool via clamp-on-read, with no orphaned used beyond the new total", async () => {
    await prisma.character.create({
      data: {
        id: CHAR_ID,
        name: "Multiclass Pool Level-Down Fixture",
        alignment: "Neutral",
        experiencePoints: 34000,
        initiativeBonus: 0,
        speed: 30,
        hitPoints: { current: 50, max: 50, temp: 0 },
        hitDice: { total: 8, die: "d8" },
        abilityScores: { strength: 14, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 13, charisma: 10 },
        savingThrowProficiencies: [],
        skills: [],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        // Ki fully spent at the original monk level 5 total.
        resources: { used: { ki: 5 } } as Prisma.InputJsonValue,
        classEntries: {
          create: [
            { name: "monk", position: 0, level: 5 },
            { name: "fighter", position: 1, level: 3, subclass: "battle master" },
          ],
        },
      },
    });

    // Directly drop the monk entry's level (bypassing the level-up/down
    // transaction endpoint — this test targets the clamp-on-read path only).
    await prisma.characterClassEntry.updateMany({
      where: { characterId: CHAR_ID, name: "monk" },
      data: { level: 2 },
    });
    // totalLevel must track the new sum (monk 2 + fighter 3 = 5) for effectiveEntryLevel to read correctly.
    await prisma.character.update({ where: { id: CHAR_ID }, data: { experiencePoints: 6500 } });

    const view = await serialize(CHAR_ID);
    const ki = view.resources?.pools.find((p) => p.key === "ki");

    expect(ki).toMatchObject({ total: 2, used: 2, remaining: 0 });
  });
});
