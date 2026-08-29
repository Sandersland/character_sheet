// Needs Postgres — the pool branch delegates to applySpendResourceInTx, which reads the character and derives the pool from class/level.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { payAbilityCostInTx } from "@/lib/spellcasting/ability-cost.js";
import { InvalidResourceOperationError } from "@/lib/classes/resources.js";

const OWNER_ID = "owner-ability-cost-pool";

const MONK_L5 = {
  name: "Ability Cost Pool Test Monk",
  alignment: "Lawful Neutral",
  experiencePoints: 6500,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 30, max: 30, temp: 0 },
  hitDice: { total: 5, die: "d8" },
  abilityScores: { strength: 10, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 14, charisma: 10 },
  savingThrowProficiencies: ["strength", "dexterity"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

describe("payAbilityCostInTx — pool branch (DB-backed)", () => {
  let characterId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    // Focus resolves through the real Monk class's ClassFeature rows — a classId-less entry would see no pools at all.
    const monkClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Monk" } })).id;
    const character = await prisma.character.create({
      data: {
        ...MONK_L5,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        resources: Prisma.JsonNull,
        classEntries: { create: [{ name: "monk", classId: monkClassId, position: 0 }] },
      },
    });
    characterId = character.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: characterId } });
  });

  it("pays 3 focus from base 2 → effectiveStep 1, persists used.focus=3, logs a spendResource event", async () => {
    const paid = await prisma.$transaction((tx) =>
      payAbilityCostInTx(
        { tx, characterId, batchId: "batch-pool-1", sessionId: null },
        { kind: "pool", key: "focus", base: 2 },
        3
      )
    );

    expect(paid.effectiveStep).toBe(1);
    expect(paid.label).toBe("Spent 3 Focus Points — 2/5 remaining");

    const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    const state = row.resources as { used: Record<string, number> };
    expect(state.used.focus).toBe(3);

    const events = await prisma.characterEvent.findMany({
      where: { characterId, category: "resources", type: "spendResource" },
    });
    expect(events).toHaveLength(1);
    expect((events[0].data as Record<string, unknown>).key).toBe("focus");
    expect((events[0].data as Record<string, unknown>).amount).toBe(3);
  });

  it("over-spending the pool throws InvalidResourceOperationError", async () => {
    await expect(
      prisma.$transaction((tx) =>
        payAbilityCostInTx(
          { tx, characterId, batchId: "batch-pool-2", sessionId: null },
          { kind: "pool", key: "focus", base: 2 },
          6
        )
      )
    ).rejects.toThrow(InvalidResourceOperationError);
  });
});
