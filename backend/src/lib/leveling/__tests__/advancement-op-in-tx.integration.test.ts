import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import {
  InvalidAdvancementOperationError,
  applyAdvancementOpInTx,
} from "@/lib/leveling/advancement.js";

const OWNER_ID = "owner-advancement-in-tx";
const BATCH = "batch-advancement-in-tx";
const XP_LVL_4 = 2700; // level 4 → 1 ASI slot

const BASE_CHAR = {
  name: "Advancement In-Tx Fixture",
  alignment: "True Neutral",
  experiencePoints: XP_LVL_4,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 30, max: 30, temp: 0 },
  hitDice: { total: 4, die: "d10" },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

describe("applyAdvancementOpInTx (#885 seam)", () => {
  const created: string[] = [];

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
  });

  afterEach(async () => {
    if (created.length) await prisma.character.deleteMany({ where: { id: { in: created.splice(0) } } });
  });

  async function fixture() {
    const character = await prisma.character.create({
      data: {
        ...BASE_CHAR,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        classEntries: { create: { name: "Fighter", level: 4, position: 0 } },
      },
    });
    created.push(character.id);
    return character.id;
  }

  it("applies an ASI to abilityScores and emits one advancement event under the caller's batchId", async () => {
    const id = await fixture();

    await prisma.$transaction((tx) =>
      applyAdvancementOpInTx(tx, id, { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] }, BATCH, null),
    );

    const row = await prisma.character.findUniqueOrThrow({ where: { id } });
    expect((row.abilityScores as Record<string, number>).strength).toBe(12);

    const events = await prisma.characterEvent.findMany({ where: { characterId: id, batchId: BATCH } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ category: "advancement", type: "abilityScoreImprovement" });
  });

  it("throws Character not found for an unknown id", async () => {
    await expect(
      prisma.$transaction((tx) =>
        applyAdvancementOpInTx(tx, "does-not-exist", { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] }, BATCH, null),
      ),
    ).rejects.toThrowError(new InvalidAdvancementOperationError("Character not found: does-not-exist"));
  });
});
