import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { applySpellcastingOpInTx } from "@/lib/spellcasting/spellcasting.js";
import { revertBatch } from "@/lib/activity/activity.js";

const OWNER_ID = "owner-font-of-magic";
const SORCERER_CATALOG_NAME = "Font of Magic Sorcerer";

// Level 5 sorcerer: 5 sorcery points; slots 4×L1, 3×L2, 2×L3.
const BASE_CHAR = {
  name: "Font of Magic Fixture",
  alignment: "Chaotic Neutral",
  experiencePoints: 6500, // level 5
  initiativeBonus: 2,
  speed: 30,
  hitPoints: { current: 28, max: 28, temp: 0 },
  hitDice: { total: 5, die: "d6" },
  abilityScores: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 18 },
  savingThrowProficiencies: ["constitution", "charisma"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

function slotsUsed(row: { spellcasting: Prisma.JsonValue }): Record<string, number> {
  return (row.spellcasting as { slotsUsed?: Record<string, number> } | null)?.slotsUsed ?? {};
}

function spRemaining(row: { resources: Prisma.JsonValue }): number {
  const used = (row.resources as { used?: Record<string, number> } | null)?.used?.sorceryPoints ?? 0;
  return 5 - used; // level-5 pool total is 5
}

describe("convertSorceryPoints (#903 Font of Magic)", () => {
  const created: string[] = [];
  let sorcererClassId: string;

  beforeAll(async () => {
    await ensureTestOwner(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: SORCERER_CATALOG_NAME },
      create: {
        name: SORCERER_CATALOG_NAME,
        hitDie: "d6",
        savingThrows: ["constitution", "charisma"],
        skillChoiceCount: 2,
        skillChoices: ["arcana", "deception"],
        isSpellcaster: true,
      },
      update: {},
    });
    sorcererClassId = cls.id;
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
  });

  afterEach(async () => {
    if (created.length) await prisma.character.deleteMany({ where: { id: { in: created.splice(0) } } });
  });

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: SORCERER_CATALOG_NAME } });
  });

  // className "sorcerer" is what deriveSpellcasting + deriveResources read.
  async function fixture(opts?: { resources?: unknown; spellcasting?: unknown }) {
    const character = await prisma.character.create({
      data: {
        ...BASE_CHAR,
        ownerId: OWNER_ID,
        spellcasting: (opts?.spellcasting as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        resources: (opts?.resources as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        classEntries: { create: { name: "sorcerer", classId: sorcererClassId, level: 5, position: 0 } },
      },
    });
    created.push(character.id);
    return character.id;
  }

  it("spends sorcery points to create a spell slot at the 5e cost table", async () => {
    const id = await fixture();
    const batch = `b-${id}`;

    await prisma.$transaction((tx) =>
      applySpellcastingOpInTx(tx, id, { type: "convertSorceryPoints", direction: "toSlot", slotLevel: 2 }, batch, null, OWNER_ID),
    );

    const row = await prisma.character.findUniqueOrThrow({ where: { id } });
    // L2 slot cost = 3 SP; creating a slot drives `used` negative (one extra slot).
    expect(spRemaining(row)).toBe(2);
    expect(slotsUsed(row)["2"]).toBe(-1);

    const events = await prisma.characterEvent.findMany({ where: { characterId: id, batchId: batch } });
    expect(events).toHaveLength(2);
    const spellEvent = events.find((e) => e.category === "spellcasting");
    expect(spellEvent).toMatchObject({ type: "convertSorceryPoints" });
    expect(spellEvent!.data).toMatchObject({ direction: "toSlot", slotLevel: 2, sorceryPointCost: 3 });
    expect(events.find((e) => e.category === "resources")).toMatchObject({ type: "spendResource" });
  });

  it("expends a spell slot to gain sorcery points equal to its level", async () => {
    // Start with all 5 SP spent so there is headroom to gain them back.
    const id = await fixture({ resources: { used: { sorceryPoints: 5 } } });
    const batch = `b-${id}`;

    await prisma.$transaction((tx) =>
      applySpellcastingOpInTx(tx, id, { type: "convertSorceryPoints", direction: "toSorceryPoints", slotLevel: 3 }, batch, null, OWNER_ID),
    );

    const row = await prisma.character.findUniqueOrThrow({ where: { id } });
    // Expend one L3 slot (used 0→1), gain 3 SP (5 spent → 2 spent → 3 remaining).
    expect(slotsUsed(row)["3"]).toBe(1);
    expect(spRemaining(row)).toBe(3);

    const events = await prisma.characterEvent.findMany({ where: { characterId: id, batchId: batch } });
    expect(events).toHaveLength(2);
    expect(events.find((e) => e.category === "spellcasting")).toMatchObject({
      type: "convertSorceryPoints",
      data: { direction: "toSorceryPoints", slotLevel: 3, sorceryPointsGained: 3 },
    });
    expect(events.find((e) => e.category === "resources")).toMatchObject({ type: "restoreResource" });
  });

  it("undoes SP→slot, restoring both the pool and the slot state", async () => {
    const id = await fixture();
    const batch = `b-${id}`;
    await prisma.$transaction((tx) =>
      applySpellcastingOpInTx(tx, id, { type: "convertSorceryPoints", direction: "toSlot", slotLevel: 1 }, batch, null, OWNER_ID),
    );

    const result = await revertBatch(prisma, id, batch);
    expect(result.ok).toBe(true);

    const row = await prisma.character.findUniqueOrThrow({ where: { id } });
    // Created slot is gone (no negative used) and the 2 SP are refunded.
    expect(slotsUsed(row)["1"] ?? 0).toBe(0);
    expect(spRemaining(row)).toBe(5);
  });

  it("undoes slot→SP, restoring both the pool and the slot state", async () => {
    const id = await fixture({ resources: { used: { sorceryPoints: 5 } } });
    const batch = `b-${id}`;
    await prisma.$transaction((tx) =>
      applySpellcastingOpInTx(tx, id, { type: "convertSorceryPoints", direction: "toSorceryPoints", slotLevel: 2 }, batch, null, OWNER_ID),
    );

    const result = await revertBatch(prisma, id, batch);
    expect(result.ok).toBe(true);

    const row = await prisma.character.findUniqueOrThrow({ where: { id } });
    // Expended slot is restored and the gained SP are given back (5 spent again → 0 remaining).
    expect(slotsUsed(row)["2"] ?? 0).toBe(0);
    expect(spRemaining(row)).toBe(0);
  });

  it("rejects creating a slot above the Font of Magic 5th-level cap", async () => {
    const id = await fixture();
    await expect(
      prisma.$transaction((tx) =>
        applySpellcastingOpInTx(tx, id, { type: "convertSorceryPoints", direction: "toSlot", slotLevel: 6 }, `b-${id}`, null, OWNER_ID),
      ),
    ).rejects.toThrow(/level 1-5/);
  });

  it("rejects creating a slot when not enough sorcery points remain", async () => {
    const id = await fixture({ resources: { used: { sorceryPoints: 5 } } }); // 0 remaining
    await expect(
      prisma.$transaction((tx) =>
        applySpellcastingOpInTx(tx, id, { type: "convertSorceryPoints", direction: "toSlot", slotLevel: 1 }, `b-${id}`, null, OWNER_ID),
      ),
    ).rejects.toThrow();
    // Nothing persisted — the whole batch rolled back.
    const row = await prisma.character.findUniqueOrThrow({ where: { id } });
    expect(slotsUsed(row)["1"] ?? 0).toBe(0);
  });

  it("rejects converting a slot with none remaining at that level", async () => {
    // Both L3 slots already expended.
    const id = await fixture({ resources: { used: { sorceryPoints: 5 } }, spellcasting: { slotsUsed: { "3": 2 } } });
    await expect(
      prisma.$transaction((tx) =>
        applySpellcastingOpInTx(tx, id, { type: "convertSorceryPoints", direction: "toSorceryPoints", slotLevel: 3 }, `b-${id}`, null, OWNER_ID),
      ),
    ).rejects.toThrow(/No level-3 spell slots remaining/);
  });

  it("rejects a slot→SP gain that would exceed the sorcery-point maximum", async () => {
    // Only 1 SP spent → 1 headroom, but a L3 slot would grant 3.
    const id = await fixture({ resources: { used: { sorceryPoints: 1 } } });
    await expect(
      prisma.$transaction((tx) =>
        applySpellcastingOpInTx(tx, id, { type: "convertSorceryPoints", direction: "toSorceryPoints", slotLevel: 3 }, `b-${id}`, null, OWNER_ID),
      ),
    ).rejects.toThrow();
  });

  it("rejects conversion for a class without the sorcery-point pool", async () => {
    // Reuse the sorcerer slots but mark the class entry a wizard — no SP pool.
    const character = await prisma.character.create({
      data: {
        ...BASE_CHAR,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        resources: Prisma.JsonNull,
        classEntries: { create: { name: "wizard", classId: sorcererClassId, level: 5, position: 0 } },
      },
    });
    created.push(character.id);
    await expect(
      prisma.$transaction((tx) =>
        applySpellcastingOpInTx(tx, character.id, { type: "convertSorceryPoints", direction: "toSlot", slotLevel: 1 }, `b-${character.id}`, null, OWNER_ID),
      ),
    ).rejects.toThrow();
  });
});
