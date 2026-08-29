import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { assertEveryClassEditionPopulated, seedClassFeatures } from "../seed-class-features.js";
import { RESEED_TIMEOUT_MS } from "./reseed-timeout.js";

describe("assertEveryClassEditionPopulated — anti-vacuity floors (#1525)", () => {
  afterEach(async () => {
    await seedClassFeatures(prisma);
  }, RESEED_TIMEOUT_MS);

  // Floors measured against the real seeded catalog, never re-derived from CLASS_FEATURES.length — an anti-vacuity check can't reuse the value it's checking.
  it("a clean seed reports summary counts at or above today's measured floors", async () => {
    const summary = await assertEveryClassEditionPopulated(prisma);

    // Also pinned to classRowCount so an emptied CharacterClass table can't shrink both sides of this assertion together.
    expect(summary.pairsChecked).toBeGreaterThanOrEqual(24);
    expect(summary.pairsChecked).toBe(summary.classRowCount * 2);

    // Tracks the most-retabbed class's smaller partition (today: Warlock's EDITION_2024 at 12), not the smallest class overall.
    expect(summary.minPairCount).toBeGreaterThanOrEqual(10);

    // Tune this floor DOWNWARD only; record the reason here when it moves.
    expect(summary.rowsCounted).toBeGreaterThanOrEqual(480);
  });
});

describe("assertEveryClassEditionPopulated — mutation proof (#1525)", () => {
  afterEach(async () => {
    await seedClassFeatures(prisma);
  }, RESEED_TIMEOUT_MS);

  it("deleting Sorcerer's EDITION_2024 rows at the DB level fails the guard, naming class and edition; reseeding restores it", async () => {
    const sorcerer = await prisma.characterClass.findUniqueOrThrow({ where: { name: "Sorcerer" } });

    // Fails if Sorcerer already had zero 2024 rows — the delete below would prove nothing.
    const before = await prisma.classFeature.count({ where: { classId: sorcerer.id, edition: "EDITION_2024" } });
    expect(before).toBeGreaterThan(0);

    await prisma.classFeature.deleteMany({ where: { classId: sorcerer.id, edition: "EDITION_2024" } });

    await expect(assertEveryClassEditionPopulated(prisma)).rejects.toThrow(/Sorcerer.*EDITION_2024/);

    await seedClassFeatures(prisma);

    await expect(assertEveryClassEditionPopulated(prisma)).resolves.toBeDefined();
    const after = await prisma.classFeature.count({ where: { classId: sorcerer.id, edition: "EDITION_2024" } });
    expect(after).toBe(before);
  }, RESEED_TIMEOUT_MS);
});
