// DB-backed proof for #1523's partition-scoped prune (#1522 decision): a
// GLOBAL name-keyed prune (staleCatalogRowsWhere's usual shape) can never
// retire a stale row for a feature name shared across more than one (class,
// subclass) scope — "Spellcasting" alone spans 7. This test is RED under a
// global prune and only green under classFeatureStaleWhere's per-(classId,
// subclassId) partitioning (seed-class-features.ts), which is the whole point
// of this file — see prune.test.ts's header for why every destructive call
// here is scoped to this file's own probe name.
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { seedClassFeatures } from "../seed-class-features.js";

// A name genuinely authored under a DIFFERENT (class, subclass) scope today
// (several classes' base layer) — inserting it under Fighter/NULL subclass is
// exactly wave 2's "removed in 2024, do not author a 2024 row" case (#1227):
// this row is stale for (fighter, NULL) even though the bare name "Spellcasting"
// is very much still seeded elsewhere.
const STALE_NAME = "Spellcasting";

describe("seedClassFeatures — prune is scoped per (classId, subclassId) partition (#1522/#1523)", () => {
  afterEach(async () => {
    // Re-seed once more so a failed assertion mid-test can't leave the stale
    // probe row (or a partition-sweep side effect) behind for later tests.
    await seedClassFeatures(prisma);
  });

  it("a stale (fighter, NULL subclass, 'Spellcasting', EDITION_2024) row is deleted on reseed, even though 'Spellcasting' is authored elsewhere", async () => {
    const fighter = await prisma.characterClass.findUniqueOrThrow({ where: { name: "Fighter" } });

    const stale = await prisma.classFeature.create({
      data: {
        classId: fighter.id,
        subclassId: null,
        name: STALE_NAME,
        level: 1,
        description: "not a real Fighter feature — planted to prove partition-scoped pruning",
        edition: "EDITION_2024",
      },
    });

    // Sanity check: the bare name really is seeded under at least one OTHER
    // partition — otherwise this test would pass even with a global prune,
    // proving nothing.
    const elsewhere = await prisma.classFeature.count({ where: { name: STALE_NAME, NOT: { id: stale.id } } });
    expect(elsewhere).toBeGreaterThan(0);

    await seedClassFeatures(prisma);

    const survived = await prisma.classFeature.findUnique({ where: { id: stale.id } });
    expect(survived).toBeNull();

    // The real "Spellcasting" rows elsewhere must have survived the same reseed.
    const stillSeededElsewhere = await prisma.classFeature.count({ where: { name: STALE_NAME } });
    expect(stillSeededElsewhere).toBeGreaterThan(0);
  });

  it("a stale row in a partition the seed still authors (fighter, NULL subclass) but under an unseeded name is deleted", async () => {
    const fighter = await prisma.characterClass.findUniqueOrThrow({ where: { name: "Fighter" } });

    const stale = await prisma.classFeature.create({
      data: {
        classId: fighter.id,
        subclassId: null,
        name: "Zzz Retired Fighter Feature (#1523)",
        level: 1,
        description: "retired",
        edition: "EDITION_2024",
      },
    });

    await seedClassFeatures(prisma);

    expect(await prisma.classFeature.findUnique({ where: { id: stale.id } })).toBeNull();
  });
});
