import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import {
  InvalidSpellcastingOperationError,
  applySpellcastingOpInTx,
} from "@/lib/spellcasting/spellcasting.js";

const OWNER_ID = "owner-spellcasting-in-tx";
const BATCH = "batch-spellcasting-in-tx";
const WIZARD_CATALOG_NAME = "Spellcasting In-Tx Wizard";
const SPELL_NAME = "Spellcasting In-Tx Magic Missile";

const TEST_SPELL = {
  name: SPELL_NAME,
  level: 1,
  school: "evocation" as const,
  castingTime: "1 action",
  range: "120 ft",
  duration: "Instantaneous",
  description: "3d4+1 force damage.",
  classes: ["wizard"],
};

const BASE_CHAR = {
  name: "Spellcasting In-Tx Fixture",
  alignment: "Neutral Good",
  experiencePoints: 0, // level 1 wizard
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 8, max: 8, temp: 0 },
  hitDice: { total: 1, die: "d6" },
  abilityScores: { strength: 8, dexterity: 12, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: ["intelligence", "wisdom"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

describe("applySpellcastingOpInTx (#885 seam)", () => {
  const created: string[] = [];
  let wizardClassId: string;
  let catalogSpellId: string;

  beforeAll(async () => {
    await ensureTestOwner(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: WIZARD_CATALOG_NAME },
      create: {
        name: WIZARD_CATALOG_NAME,
        hitDie: "d6",
        savingThrows: ["intelligence", "wisdom"],
        skillChoiceCount: 2,
        skillChoices: ["arcana", "history"],
        isSpellcaster: true,
      },
      update: {},
    });
    wizardClassId = cls.id;
    const spell = await prisma.spell.upsert({
      where: { name: TEST_SPELL.name },
      create: TEST_SPELL,
      update: TEST_SPELL,
    });
    catalogSpellId = spell.id;
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
  });

  afterEach(async () => {
    if (created.length) await prisma.character.deleteMany({ where: { id: { in: created.splice(0) } } });
  });

  afterAll(async () => {
    await prisma.spell.deleteMany({ where: { name: SPELL_NAME } });
    await prisma.characterClass.deleteMany({ where: { name: WIZARD_CATALOG_NAME } });
  });

  async function fixture() {
    // Entry snapshot name "wizard" is what deriveSpellcasting reads for the caster type.
    const character = await prisma.character.create({
      data: {
        ...BASE_CHAR,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        classEntries: { create: { name: "wizard", classId: wizardClassId, level: 1, position: 0 } },
      },
    });
    created.push(character.id);
    return character.id;
  }

  it("learns a catalog spell and emits one spellcasting event under the caller's batchId", async () => {
    const id = await fixture();

    await prisma.$transaction((tx) =>
      applySpellcastingOpInTx(tx, id, { type: "learnSpell", spellId: catalogSpellId }, BATCH, null, OWNER_ID),
    );

    const row = await prisma.character.findUniqueOrThrow({ where: { id } });
    const spells = (row.spellcasting as { spells: { name: string; spellId?: string }[] }).spells;
    expect(spells.some((s) => s.spellId === catalogSpellId)).toBe(true);

    const events = await prisma.characterEvent.findMany({ where: { characterId: id, batchId: BATCH } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ category: "spellcasting", type: "learnSpell" });
    expect(events[0].data).toMatchObject({ spellId: catalogSpellId });
  });

  it("throws Character not found for an unknown id", async () => {
    await expect(
      prisma.$transaction((tx) =>
        applySpellcastingOpInTx(tx, "does-not-exist", { type: "learnSpell", spellId: catalogSpellId }, BATCH, null, OWNER_ID),
      ),
    ).rejects.toThrowError(new InvalidSpellcastingOperationError("Character not found: does-not-exist"));
  });
});
