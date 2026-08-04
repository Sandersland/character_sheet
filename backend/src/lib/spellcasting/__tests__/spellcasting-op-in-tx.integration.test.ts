import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";
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
    // upsertEditionRow, not .upsert(): Spell's business key is now (name,
    // edition) (#1710), and this fixture spell is edition-neutral.
    const spell = await upsertEditionRow(
      prisma.spell,
      { name: TEST_SPELL.name, edition: null },
      { ...TEST_SPELL, edition: null },
      TEST_SPELL,
    );
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

// #1507 D7: a 2014 Bard is a "known" caster (SRD 5.1) — a learned spell is
// castable immediately, no separate preparation step. A 2024 Bard is
// "prepared" (SRD 5.2) — the born-`prepared: false` behavior every other
// learnSpell case in this file already exercises.
describe("applySpellcastingOpInTx — learnSpell born-prepared (#1507 D7)", () => {
  const created: string[] = [];
  const BARD_CATALOG_NAME = "Spellcasting In-Tx Bard";
  const BARD_SPELL_NAME = "Spellcasting In-Tx Vicious Mockery";
  let bardClassId: string;
  let bardSpellId: string;

  beforeAll(async () => {
    await ensureTestOwner(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: BARD_CATALOG_NAME },
      create: {
        name: BARD_CATALOG_NAME,
        hitDie: "d8",
        savingThrows: ["dexterity", "charisma"],
        skillChoiceCount: 3,
        skillChoices: ["performance", "persuasion", "deception"],
        isSpellcaster: true,
      },
      update: {},
    });
    bardClassId = cls.id;
    // upsertEditionRow, not .upsert(): Spell's business key is now (name,
    // edition) (#1710), and this fixture spell is edition-neutral.
    const bardSpellData = {
      name: BARD_SPELL_NAME,
      level: 1,
      school: "enchantment" as const,
      castingTime: "1 action",
      range: "60 ft",
      duration: "Instantaneous",
      description: "1d4 psychic damage.",
      classes: ["bard"],
    };
    const spell = await upsertEditionRow(
      prisma.spell,
      { name: BARD_SPELL_NAME, edition: null },
      { ...bardSpellData, edition: null },
      bardSpellData,
    );
    bardSpellId = spell.id;
  });

  afterEach(async () => {
    if (created.length) await prisma.character.deleteMany({ where: { id: { in: created.splice(0) } } });
  });

  afterAll(async () => {
    await prisma.spell.deleteMany({ where: { name: BARD_SPELL_NAME } });
    await prisma.characterClass.deleteMany({ where: { name: BARD_CATALOG_NAME } });
  });

  async function bardFixture(rulesEdition: "EDITION_2014" | "EDITION_2024") {
    const character = await prisma.character.create({
      data: {
        ...BASE_CHAR,
        name: `Spellcasting In-Tx Bard Fixture (${rulesEdition})`,
        rulesEdition,
        ownerId: OWNER_ID,
        experiencePoints: 6500, // level 5
        abilityScores: { strength: 8, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 10, charisma: 16 },
        spellcasting: Prisma.JsonNull,
        classEntries: { create: { name: "bard", classId: bardClassId, level: 5, position: 0 } },
      },
    });
    created.push(character.id);
    return character.id;
  }

  it("a 2014 bard's learnSpell yields prepared: true", async () => {
    const id = await bardFixture("EDITION_2014");
    await prisma.$transaction((tx) =>
      applySpellcastingOpInTx(tx, id, { type: "learnSpell", spellId: bardSpellId }, BATCH, null, OWNER_ID),
    );
    const row = await prisma.character.findUniqueOrThrow({ where: { id } });
    const spells = (row.spellcasting as { spells: { spellId?: string; prepared: boolean }[] }).spells;
    expect(spells.find((s) => s.spellId === bardSpellId)?.prepared).toBe(true);
  });

  it("a 2024 bard's learnSpell yields prepared: false", async () => {
    const id = await bardFixture("EDITION_2024");
    await prisma.$transaction((tx) =>
      applySpellcastingOpInTx(tx, id, { type: "learnSpell", spellId: bardSpellId }, BATCH, null, OWNER_ID),
    );
    const row = await prisma.character.findUniqueOrThrow({ where: { id } });
    const spells = (row.spellcasting as { spells: { spellId?: string; prepared: boolean }[] }).spells;
    expect(spells.find((s) => s.spellId === bardSpellId)?.prepared).toBe(false);
  });
});
