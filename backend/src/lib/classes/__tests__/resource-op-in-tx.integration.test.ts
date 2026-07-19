import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { InvalidResourceOperationError, applyResourceOpInTx } from "@/lib/classes/resources.js";

const OWNER_ID = "owner-resource-in-tx";
const BATCH = "batch-resource-in-tx";

// Barbarian L1 → 2 rage uses, derived purely from SRD data (no catalog rows).
const BASE_CHAR = {
  name: "Resource In-Tx Fixture",
  alignment: "Chaotic Neutral",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 12, max: 12, temp: 0 },
  hitDice: { total: 1, die: "d12" },
  abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

describe("applyResourceOpInTx (#885 seam)", () => {
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
        classEntries: { create: { name: "Barbarian", level: 1, position: 0 } },
      },
    });
    created.push(character.id);
    return character.id;
  }

  it("spends a resource and emits one resources event under the caller's batchId", async () => {
    const id = await fixture();

    await prisma.$transaction((tx) =>
      applyResourceOpInTx(tx, id, { type: "spendResource", key: "rage" }, BATCH, null),
    );

    const row = await prisma.character.findUniqueOrThrow({ where: { id } });
    expect((row.resources as { used?: Record<string, number> }).used?.rage).toBe(1);

    const events = await prisma.characterEvent.findMany({ where: { characterId: id, batchId: BATCH } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ category: "resources", type: "spendResource" });
    expect(events[0].data).toMatchObject({ key: "rage", amount: 1 });
  });

  it("throws Character not found for an unknown id", async () => {
    await expect(
      prisma.$transaction((tx) =>
        applyResourceOpInTx(tx, "does-not-exist", { type: "spendResource", key: "rage" }, BATCH, null),
      ),
    ).rejects.toThrowError(new InvalidResourceOperationError("Character not found: does-not-exist"));
  });
});
