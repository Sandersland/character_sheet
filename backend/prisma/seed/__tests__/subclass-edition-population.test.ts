// Calls assertEverySubclassEditionPopulated directly, never through seedClassFeatures — the seeder rewrites every row before reaching its own guard, so routing a broken-state probe through it could only ever pass.
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import {
  assertEverySubclassEditionPopulated,
  subclassPopulationFailures,
  seedClassFeatures,
  type SubclassPresenceInput,
} from "../seed-class-features.js";
import { RESEED_TIMEOUT_MS } from "./reseed-timeout.js";

describe("subclassPopulationFailures — pure guard logic, fabricated inputs (#1559)", () => {
  const row = (overrides: Partial<SubclassPresenceInput>): SubclassPresenceInput => ({
    slug: "fixture-subclass",
    edition: null,
    presentEditions: [],
    ...overrides,
  });

  it("a shared (edition: null) row with rows in both editions passes", () => {
    const failures = subclassPopulationFailures([
      row({ edition: null, presentEditions: ["EDITION_2014", "EDITION_2024"] }),
    ]);
    expect(failures).toEqual([]);
  });

  it("a shared (edition: null) row missing one edition fails, naming the missing edition", () => {
    const failures = subclassPopulationFailures([row({ edition: null, presentEditions: ["EDITION_2014"] })]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("fixture-subclass / EDITION_2024");
  });

  it("an EDITION_2014-tagged row with 2014 rows only passes", () => {
    const failures = subclassPopulationFailures([
      row({ slug: "barbarian-totem-warrior", edition: "EDITION_2014", presentEditions: ["EDITION_2014"] }),
    ]);
    expect(failures).toEqual([]);
  });

  it("an EDITION_2014-tagged row with no 2014 rows fails, naming its own edition", () => {
    const failures = subclassPopulationFailures([
      row({ slug: "barbarian-totem-warrior", edition: "EDITION_2014", presentEditions: [] }),
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("barbarian-totem-warrior / EDITION_2014");
  });

  it("aggregates failures across multiple rows, one message per missing (slug, edition) pair", () => {
    const failures = subclassPopulationFailures([
      row({ slug: "aaa", edition: null, presentEditions: ["EDITION_2014", "EDITION_2024"] }),
      row({ slug: "bbb", edition: null, presentEditions: ["EDITION_2014"] }),
      row({ slug: "ccc", edition: "EDITION_2024", presentEditions: [] }),
    ]);
    expect(failures).toEqual([
      "  bbb / EDITION_2024: 0 ClassFeature rows (expected >= 1)",
      "  ccc / EDITION_2024: 0 ClassFeature rows (expected >= 1)",
    ]);
  });
});

describe("assertEverySubclassEditionPopulated — real seeded catalog (#1559)", () => {
  it("a clean seed passes, and Path of the Totem Warrior is why the guard is exercised at all", async () => {
    const totemWarrior = await prisma.subclass.findFirstOrThrow({
      where: { slug: "barbarian-totem-warrior" },
    });
    expect(totemWarrior.edition).toBe("EDITION_2014");

    await expect(assertEverySubclassEditionPopulated(prisma)).resolves.toBeDefined();
  });

  it("Warlock's The Archfey and The Great Old One are tagged EDITION_2014 for the same reason as Totem Warrior", async () => {
    const archfey = await prisma.subclass.findFirstOrThrow({ where: { slug: "warlock-the-archfey" } });
    const greatOldOne = await prisma.subclass.findFirstOrThrow({ where: { slug: "warlock-the-great-old-one" } });
    expect(archfey.edition).toBe("EDITION_2014");
    expect(greatOldOne.edition).toBe("EDITION_2014");
  });

  it("reports non-vacuous summary counts against the real catalog", async () => {
    const summary = await assertEverySubclassEditionPopulated(prisma);
    // pairsChecked must stay strictly less than subclassesChecked * 2 (Totem Warrior is checked in only one edition), or this assertion is vacuous.
    expect(summary.subclassesChecked).toBeGreaterThanOrEqual(31);
    expect(summary.pairsChecked).toBeGreaterThanOrEqual(summary.subclassesChecked);
    expect(summary.pairsChecked).toBeLessThan(summary.subclassesChecked * 2);
  });
});

describe("assertEverySubclassEditionPopulated — mutation proof, both directions (#1559)", () => {
  afterEach(async () => {
    // Restores Totem Warrior's edition tag and reseeds ClassFeature rows — tests below mutate/delete them directly.
    const totemWarrior = await prisma.subclass.findFirstOrThrow({
      where: { slug: "barbarian-totem-warrior" },
    });
    await prisma.subclass.update({ where: { id: totemWarrior.id }, data: { edition: "EDITION_2014" } });
    await seedClassFeatures(prisma);
  }, RESEED_TIMEOUT_MS);

  it("un-tagging Totem Warrior back to shared (edition: null) fails the guard, naming the missing edition; retagging restores it", async () => {
    const totemWarrior = await prisma.subclass.findFirstOrThrow({
      where: { slug: "barbarian-totem-warrior" },
    });
    await prisma.subclass.update({ where: { id: totemWarrior.id }, data: { edition: null } });

    await expect(assertEverySubclassEditionPopulated(prisma)).rejects.toThrow(
      /barbarian-totem-warrior \/ EDITION_2024/,
    );

    await prisma.subclass.update({ where: { id: totemWarrior.id }, data: { edition: "EDITION_2014" } });
    await expect(assertEverySubclassEditionPopulated(prisma)).resolves.toBeDefined();
  });

  it("deleting Totem Warrior's EDITION_2014 ClassFeature rows fails the guard, naming its own edition; reseeding restores it", async () => {
    const totemWarrior = await prisma.subclass.findFirstOrThrow({
      where: { slug: "barbarian-totem-warrior" },
    });

    const before = await prisma.classFeature.count({
      where: { subclassId: totemWarrior.id, edition: "EDITION_2014" },
    });
    expect(before).toBeGreaterThan(0);

    await prisma.classFeature.deleteMany({ where: { subclassId: totemWarrior.id, edition: "EDITION_2014" } });

    await expect(assertEverySubclassEditionPopulated(prisma)).rejects.toThrow(
      /barbarian-totem-warrior \/ EDITION_2014/,
    );

    await seedClassFeatures(prisma);

    await expect(assertEverySubclassEditionPopulated(prisma)).resolves.toBeDefined();
    const after = await prisma.classFeature.count({
      where: { subclassId: totemWarrior.id, edition: "EDITION_2014" },
    });
    expect(after).toBe(before);
  }, RESEED_TIMEOUT_MS);
});
