// createBarbarian pins rulesEdition to EDITION_2014 explicitly — the schema default is EDITION_2024.
import { afterEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { applyHitPointOperations } from "@/lib/combat/hitpoints.js";

const OWNER_ID = "owner-rest-pool-parity-1221";
const BARB_ID = "test-rest-pool-parity-barbarian-1221";

const BASE_CHAR = {
  alignment: "Chaotic Neutral",
  initiativeBonus: 2,
  speed: 40,
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

async function readRow(characterId: string) {
  return prisma.character.findUniqueOrThrow({ where: { id: characterId } });
}

async function createBarbarian() {
  await ensureTestOwner(OWNER_ID);
  const barbClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Barbarian" } })).id;
  await prisma.character.create({
    data: {
      ...BASE_CHAR,
      id: BARB_ID,
      name: "Rest Pool Parity Barbarian",
      ownerId: OWNER_ID,
      rulesEdition: "EDITION_2014",
      experiencePoints: 0,
      hitPoints: { current: 10, max: 12, temp: 0 },
      hitDice: { total: 1, die: "d12", spent: 0 },
      abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 8, wisdom: 10, charisma: 8 },
      spellcasting: Prisma.JsonNull,
      resources: { used: { rage: 1 } } as Prisma.InputJsonValue,
      classEntries: { create: [{ name: "barbarian", classId: barbClassId, position: 0, level: 1 }] },
    },
  });
}

describe("Rage (longRest) rest parity — unchanged by #1221 (Barbarian declares no shortRestRegain)", () => {
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: BARB_ID } });
  });

  it("short rest leaves Rage's used count untouched — Rage's recharge is longRest-only, no partial top-up declared", async () => {
    await createBarbarian();

    await applyHitPointOperations(BARB_ID, [{ type: "shortRest", rolls: [4] }]);

    const row = await readRow(BARB_ID);
    const used = (row.resources as { used: Record<string, number> }).used;
    // The assertion a "default shortRestRegain to 1" mutation would turn red.
    expect(used.rage ?? 0).toBe(1);
  });

  it("long rest fully restores Rage to 0 expended", async () => {
    await createBarbarian();

    await applyHitPointOperations(BARB_ID, [{ type: "longRest" }]);

    const row = await readRow(BARB_ID);
    const used = (row.resources as { used: Record<string, number> }).used;
    expect(used.rage ?? 0).toBe(0);
  });
});
