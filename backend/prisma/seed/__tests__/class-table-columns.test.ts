// DB-backed proof for #1529: five class-name-keyed lib/srd/ records
// (CLASS_PROFICIENCY_GRANTS, EXTRA_ASI_LEVELS, fightingStyleFeatSlots'
// per-class levels, MULTICLASS_PREREQUISITES, PRIMARY_ABILITIES) moved onto
// CharacterClass columns. The template DB vitest.global-setup.ts clones from
// already ran `prisma migrate deploy` + `prisma db seed` once, so every row
// asserted against below is the REAL seeded catalog (never a fixture) — this
// suite is a positive control on that real seed, the same shape
// class-feature-migration.test.ts uses.
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { CLASSES } from "../catalog-data.js";

describe("CharacterClass column migration (#1529) — the twelve rows round-trip CLASSES exactly", () => {
  it("every seeded class's new columns match its CLASSES source row verbatim", async () => {
    const rows = await prisma.characterClass.findMany({
      where: { name: { in: CLASSES.map((c) => c.name) } },
      select: {
        name: true,
        armorProficiencies: true,
        weaponProficiencies: true,
        extraAsiLevels: true,
        fightingStyleFeatLevel: true,
        multiclassPrerequisites: true,
        primaryAbilities: true,
      },
    });
    expect(rows).toHaveLength(CLASSES.length);
    const byName = new Map(rows.map((r) => [r.name, r]));

    for (const cls of CLASSES) {
      const row = byName.get(cls.name);
      expect(row, `missing seeded row for "${cls.name}"`).toBeDefined();
      expect(row!.armorProficiencies, cls.name).toEqual(cls.armorProficiencies);
      expect(row!.weaponProficiencies, cls.name).toEqual(cls.weaponProficiencies);
      expect(row!.extraAsiLevels, cls.name).toEqual(cls.extraAsiLevels);
      expect(row!.fightingStyleFeatLevel, cls.name).toBe(cls.fightingStyleFeatLevel);
      expect(row!.multiclassPrerequisites, cls.name).toEqual(cls.multiclassPrerequisites);
      expect(row!.primaryAbilities, cls.name).toEqual(cls.primaryAbilities);
    }
  });

  // Mutation proof (manual, recorded in the PR): editing Fighter's
  // extraAsiLevels in CLASSES without re-seeding leaves the DB row unchanged,
  // failing this test's per-row equality — confirmed by temporarily changing
  // Fighter's `extraAsiLevels: [6, 14]` to `[6]` in catalog-data.ts and
  // re-running without `prisma db seed`, which goes red naming "Fighter".
  it("Fighter's OR-shaped multiclass prerequisite round-trips as an array of option objects, not a flattened list", async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({
      where: { name: "Fighter" },
      select: { multiclassPrerequisites: true },
    });
    expect(fighter.multiclassPrerequisites).toEqual([{ strength: 13 }, { dexterity: 13 }]);
  });
});

describe("CharacterClass column migration (#1529) — schema defaults on an existing row", () => {
  const TRANSIENT_NAME = "Test Transient Class (#1529 migration)";

  afterEach(async () => {
    // Cleanup — #1543: a leftover transient CharacterClass row trips
    // assertEveryClassEditionPopulated in a later test file.
    await prisma.characterClass.deleteMany({ where: { name: TRANSIENT_NAME } });
  });

  it("a row created without the new columns gets the migration's defaults, not an error", async () => {
    const row = await prisma.characterClass.create({
      data: {
        name: TRANSIENT_NAME,
        hitDie: "d8",
        savingThrows: ["wisdom"],
        skillChoiceCount: 1,
        skillChoices: ["insight"],
        isSpellcaster: false,
      },
    });
    expect(row.armorProficiencies).toEqual([]);
    expect(row.weaponProficiencies).toEqual([]);
    expect(row.extraAsiLevels).toEqual([]);
    expect(row.fightingStyleFeatLevel).toBeNull();
    expect(row.multiclassPrerequisites).toEqual([]);
    expect(row.primaryAbilities).toEqual([]);
  });
});
