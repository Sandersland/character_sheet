// PR #1567 review, fix 3: schema.prisma's comment on StartingEquipmentPackage
// says the three gold-dice columns are "jointly null, never partially" —
// mapGold's two non-null assertions (backend lib/inventory/starting-equipment
// -package.ts) rest entirely on that convention, with nothing enforcing it at
// the DB. A CHECK constraint makes a partial-null row impossible to write in
// the first place, rather than trusting every future write path to honour a
// comment. No Prisma-level test covers this elsewhere — StartingEquipmentPackage
// rows are otherwise only ever written through packageCreateData/
// goldColumnsCreateInput (seed-starting-equipment.ts), which already keeps the
// three jointly null or jointly set; this proves the DB itself refuses the
// shape those functions would never produce.
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

  // Every test shares one (classId, edition) pair — @@unique([classId, edition])
  // would otherwise reject the SECOND test's insert for the wrong reason (a
  // uniqueness violation, not the gold-dice CHECK this file exists to prove).
  // A successful create must be cleaned up regardless of whether the test's
  // own assertion passed or failed (a rejected-partial-null test that
  // unexpectedly succeeds — the exact red state this file's TDD pass hit —
  // would otherwise leave a stray row poisoning every later test in the file).
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
