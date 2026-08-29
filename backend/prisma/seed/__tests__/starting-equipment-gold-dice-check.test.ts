import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

const FIXTURE_CLASS = {
  name: "Zzz Fixture Gold Dice Check Class (#1564)",
  hitDie: "d8",
  savingThrows: ["dexterity"],
  skillChoiceCount: 0,
  skillChoices: [] as string[],
  isSpellcaster: false,
};

let fixtureClassId: string;

describe("StartingEquipmentPackage gold-dice columns are jointly null or jointly set (#1564 PR #1567 fix 3)", () => {
  beforeAll(async () => {
    const cls = await prisma.characterClass.upsert({
      where: { name: FIXTURE_CLASS.name },
      create: FIXTURE_CLASS,
      update: FIXTURE_CLASS,
    });
    fixtureClassId = cls.id;
  });

  // Every test shares one (classId, edition) pair; @@unique([classId, edition]) would otherwise reject the second insert.
  afterEach(async () => {
    await prisma.startingEquipmentPackage.deleteMany({ where: { classId: fixtureClassId } });
  });

  afterAll(async () => {
    // Cascades to any package rows created below (schema onDelete: Cascade).
    await prisma.characterClass.deleteMany({ where: { name: FIXTURE_CLASS.name } });
  });

  it("accepts a fully non-null gold-dice package (the every EDITION_2014 shape)", async () => {
    await expect(
      prisma.startingEquipmentPackage.create({
        data: {
          classId: fixtureClassId,
          name: FIXTURE_CLASS.name,
          edition: "EDITION_2014",
          goldDiceCount: 5,
          goldDiceFaces: 4,
          goldMultiplier: 10,
        },
      }),
    ).resolves.toBeDefined();
  });

  it("accepts a fully null gold-dice package (PHB'24: no roll-for-gold rule at all)", async () => {
    await expect(
      prisma.startingEquipmentPackage.create({
        data: {
          classId: fixtureClassId,
          name: FIXTURE_CLASS.name,
          edition: "EDITION_2014",
          goldDiceCount: null,
          goldDiceFaces: null,
          goldMultiplier: null,
        },
      }),
    ).resolves.toBeDefined();
  });

  it("rejects a partially-null gold-dice package (only goldDiceCount set)", async () => {
    await expect(
      prisma.startingEquipmentPackage.create({
        data: {
          classId: fixtureClassId,
          name: FIXTURE_CLASS.name,
          edition: "EDITION_2014",
          goldDiceCount: 5,
          goldDiceFaces: null,
          goldMultiplier: null,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a partially-null gold-dice package (only goldDiceFaces null)", async () => {
    await expect(
      prisma.startingEquipmentPackage.create({
        data: {
          classId: fixtureClassId,
          name: FIXTURE_CLASS.name,
          edition: "EDITION_2014",
          goldDiceCount: 5,
          goldDiceFaces: null,
          goldMultiplier: 10,
        },
      }),
    ).rejects.toThrow();
  });
});
