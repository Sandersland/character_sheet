// DB-backed proof for #1525's per-class per-edition population guard
// (assertEveryClassEditionPopulated, seed-class-features.ts): a class whose
// EDITION_2024 partition failed to seed doesn't fall back to 2014 text (see
// featuresFromRows' plain `.filter(row => row.edition === edition && ...)`,
// lib/classes/class-feature-rows.ts) — it renders NO features at all. This
// suite proves the guard actually fires on that state, and that its returned
// summary is a real DB read rather than a vacuous "all clear".
//
// Calls assertEveryClassEditionPopulated DIRECTLY, never through
// seedClassFeatures: the seeder rewrites every row before reaching the guard
// at the end of its own body, so routing a broken-state probe through it
// could only ever pass. Mirrors class-feature-prune.test.ts's `afterEach`
// re-seed idiom so a failed assertion mid-test can't leave the template DB
// short for a later file.
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { assertEveryClassEditionPopulated, seedClassFeatures } from "../seed-class-features.js";
import { RESEED_TIMEOUT_MS } from "./reseed-timeout.js";

describe("assertEveryClassEditionPopulated — anti-vacuity floors (#1525)", () => {
  afterEach(async () => {
    await seedClassFeatures(prisma);
  }, RESEED_TIMEOUT_MS);

  // Literals measured directly against this tree's real seeded catalog (12
  // classes, 522 rows, Sorcerer the smallest pair at 15/15, Monk the largest
  // at 37/37) — never re-derived from CLASS_FEATURES.length or any other
  // value the guard itself could also get wrong, which is the whole point of
  // an anti-vacuity check (the #1499 `triplesVisited >= 158` shape).
  it("a clean seed reports summary counts at or above today's measured floors", async () => {
    const summary = await assertEveryClassEditionPopulated(prisma);

    // 12 seeded classes x 2 editions. Also pinned to classRowCount so an
    // emptied CharacterClass table can't shrink both sides of this
    // assertion together — the literal 24 is what stops that from being
    // self-satisfying.
    expect(summary.pairsChecked).toBeGreaterThanOrEqual(24);
    expect(summary.pairsChecked).toBe(summary.classRowCount * 2);

    // Today's real minimum is Sorcerer at 15 (both editions) — five rows of
    // slack below that catches a half-written partition, which a bare
    // `>= 1` sails straight past.
    expect(summary.minPairCount).toBeGreaterThanOrEqual(10);

    // 522 today (256 untagged features x2 editions + 10 pre-forked rows).
    // ~8% slack for wave-2's net churn — tune this DOWNWARD only, and record
    // the reason here when it moves.
    expect(summary.rowsCounted).toBeGreaterThanOrEqual(480);
  });
});

describe("assertEveryClassEditionPopulated — mutation proof (#1525)", () => {
  afterEach(async () => {
    // Restores whatever a test deleted — belt-and-suspenders alongside each
    // test's own explicit restore step below.
    await seedClassFeatures(prisma);
  }, RESEED_TIMEOUT_MS);

  it("deleting Sorcerer's EDITION_2024 rows at the DB level fails the guard, naming class and edition; reseeding restores it", async () => {
    const sorcerer = await prisma.characterClass.findUniqueOrThrow({ where: { name: "Sorcerer" } });

    // Sanity check this fixture assumption before mutating: if Sorcerer had
    // zero 2024 rows already, the delete below would prove nothing.
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
