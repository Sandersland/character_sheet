import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { seedClassFeatures } from "../seed-class-features.js";
import { RESEED_TIMEOUT_MS } from "./reseed-timeout.js";

// "Spellcasting" is genuinely authored under other (class, subclass) scopes, so this row is stale for (fighter, NULL) even though the bare name is seeded elsewhere.
const STALE_NAME = "Spellcasting";

describe("seedClassFeatures — prune is scoped per (classId, subclassId) partition (#1522/#1523)", () => {
  afterEach(async () => {
    await seedClassFeatures(prisma);
  }, RESEED_TIMEOUT_MS);

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

    const elsewhere = await prisma.classFeature.count({ where: { name: STALE_NAME, NOT: { id: stale.id } } });
    expect(elsewhere).toBeGreaterThan(0);

    await seedClassFeatures(prisma);

    const survived = await prisma.classFeature.findUnique({ where: { id: stale.id } });
    expect(survived).toBeNull();

    const stillSeededElsewhere = await prisma.classFeature.count({ where: { name: STALE_NAME } });
    expect(stillSeededElsewhere).toBeGreaterThan(0);
  }, RESEED_TIMEOUT_MS);

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
  }, RESEED_TIMEOUT_MS);
});
