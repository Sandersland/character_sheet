// DB-backed proof + pure-logic unit tests for #1559's per-subclass
// per-edition population guard (assertEverySubclassEditionPopulated,
// seed-class-features.ts) — the general form of the bug Path of the Totem
// Warrior disclosed: a subclass offered for an edition (edition: null offers
// both) with zero ClassFeature rows in that edition renders a featureless
// sheet the moment a character picks it, same failure shape as
// assertEveryClassEditionPopulated's class-level guard (#1525) one level up.
//
// Calls assertEverySubclassEditionPopulated DIRECTLY, never through
// seedClassFeatures: the seeder rewrites every row before reaching the guard
// at the end of its own body, so routing a broken-state probe through it
// could only ever pass — same reasoning as class-feature-population.test.ts's
// header.
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import {
  assertEverySubclassEditionPopulated,
  subclassPopulationFailures,
  seedClassFeatures,
  type SubclassPresenceInput,
} from "../seed-class-features.js";

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

  // This is Path of the Totem Warrior's own shape post-fix.
  it("an EDITION_2014-tagged row with 2014 rows only passes", () => {
    const failures = subclassPopulationFailures([
      row({ slug: "barbarian-totem-warrior", edition: "EDITION_2014", presentEditions: ["EDITION_2014"] }),
    ]);
    expect(failures).toEqual([]);
  });

  // This is Path of the Totem Warrior's shape at HEAD, before it was tagged:
  // offered for both editions (edition: null) but zero EDITION_2024 rows —
  // covered by the case above too, restated here under its OWN tag to prove
  // a same-edition-as-offered row with no content still fails.
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
    // The empirical finding this issue's brief asked for: at HEAD (before
    // #1559 tagged this row) it was `edition: null` (offered both editions)
    // with 5 ClassFeature rows in EDITION_2014 and 0 in EDITION_2024 — the
    // guard would have failed. Tagging it EDITION_2014 narrows what it's
    // offered for to exactly the edition it has content in.
    expect(totemWarrior.edition).toBe("EDITION_2014");

    await expect(assertEverySubclassEditionPopulated(prisma)).resolves.toBeDefined();
  });

  // Same Totem-Warrior-shaped disclosure as above, extended (#1233): The
  // Archfey and The Great Old One's PHB'24 reworks are non-SRD and
  // unverifiable, so the same "tag EDITION_2014, author zero EDITION_2024
  // rows" fix applies to both — without it, the seed would offer either
  // patron to a 2024 character with zero ClassFeature rows to serve, hard-
  // failing this exact guard.
  it("Warlock's The Archfey and The Great Old One are tagged EDITION_2014 for the same reason as Totem Warrior", async () => {
    const archfey = await prisma.subclass.findFirstOrThrow({ where: { slug: "warlock-the-archfey" } });
    const greatOldOne = await prisma.subclass.findFirstOrThrow({ where: { slug: "warlock-the-great-old-one" } });
    expect(archfey.edition).toBe("EDITION_2014");
    expect(greatOldOne.edition).toBe("EDITION_2014");
  });

  it("reports non-vacuous summary counts against the real catalog", async () => {
    const summary = await assertEverySubclassEditionPopulated(prisma);
    // 31 seeded subclasses today; every one of them is checked in at least
    // one edition, and Totem Warrior is checked in exactly one (not two),
    // so pairsChecked must be strictly less than subclassesChecked * 2 —
    // the literal that stops this assertion from being self-satisfying.
    expect(summary.subclassesChecked).toBeGreaterThanOrEqual(31);
    expect(summary.pairsChecked).toBeGreaterThanOrEqual(summary.subclassesChecked);
    expect(summary.pairsChecked).toBeLessThan(summary.subclassesChecked * 2);
  });
});

describe("assertEverySubclassEditionPopulated — mutation proof, both directions (#1559)", () => {
  afterEach(async () => {
    // Belt-and-suspenders restore: reset Totem Warrior's edition tag (a test
    // below mutates it at the DB level to reproduce the pre-#1559 HEAD
    // state) and reseed ClassFeature rows (another test deletes them).
    const totemWarrior = await prisma.subclass.findFirstOrThrow({
      where: { slug: "barbarian-totem-warrior" },
    });
    await prisma.subclass.update({ where: { id: totemWarrior.id }, data: { edition: "EDITION_2014" } });
    await seedClassFeatures(prisma);
  });

  // Reproduces the EXACT pre-#1559 HEAD condition (verified empirically
  // against a throwaway DB before this guard existed): Subclass.edition back
  // to null (offered both editions) while only the 5 EDITION_2014
  // ClassFeature rows exist. The guard must reject it, naming the row's slug
  // and the missing edition.
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
  });
});
