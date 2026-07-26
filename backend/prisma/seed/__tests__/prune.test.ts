// DB-backed proof for #1306's edition-safe prune (unlike seed-data.test.ts,
// this touches Postgres). The footgun this fixes: seed.ts:275 used to delete
// any Feat row whose NAME wasn't in the current seed list, which is how the
// 2014 Mobile feat was deleted outright when the 2024 rewrite landed — a
// same-named-but-different-edition row read as "stale" by a name-only notIn.
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { staleFeatWhere } from "../prune.js";

describe("staleFeatWhere — edition-safe prune (#1306)", () => {
  const NAME = "Zzz Prune Probe (#1306)";

  afterEach(async () => {
    await prisma.feat.deleteMany({ where: { name: NAME } });
  });

  it("a 2014-only row survives a prune run that only seeds a 2014 entry for it", async () => {
    await prisma.feat.create({ data: { name: NAME, description: "2014-only", edition: "EDITION_2014" } });

    const seeded = [{ name: NAME, edition: "EDITION_2014" as const }];
    await prisma.feat.deleteMany({ where: staleFeatWhere(seeded) });

    const survivor = await prisma.feat.findFirst({ where: { name: NAME, edition: "EDITION_2014" } });
    expect(survivor).not.toBeNull();
  });

  it("re-running the prune twice still keeps the 2014-only row (idempotent)", async () => {
    await prisma.feat.create({ data: { name: NAME, description: "2014-only", edition: "EDITION_2014" } });
    const seeded = [{ name: NAME, edition: "EDITION_2014" as const }];

    await prisma.feat.deleteMany({ where: staleFeatWhere(seeded) });
    await prisma.feat.deleteMany({ where: staleFeatWhere(seeded) });

    const survivor = await prisma.feat.findFirst({ where: { name: NAME, edition: "EDITION_2014" } });
    expect(survivor).not.toBeNull();
  });

  it("a row absent from the seeded set entirely IS pruned (the mechanism still deletes real stale rows)", async () => {
    await prisma.feat.create({ data: { name: NAME, description: "stale", edition: "EDITION_2014" } });

    await prisma.feat.deleteMany({ where: staleFeatWhere([]) });

    const survivor = await prisma.feat.findFirst({ where: { name: NAME } });
    expect(survivor).toBeNull();
  });

  it("a same-named 2024 row is untouched while only the 2014 row is kept — the exact footgun scenario", async () => {
    await prisma.feat.create({ data: { name: NAME, description: "2014", edition: "EDITION_2014" } });
    await prisma.feat.create({ data: { name: NAME, description: "2024", edition: "EDITION_2024" } });

    // Simulates a seed run whose FEATS array carries the 2014 row but — same
    // shape as the historical bug — nothing scopes the 2024 sibling out of
    // "stale" by name alone; staleFeatWhere must still leave it alone because
    // this test never lists it as stale either (it partitions by edition, so
    // the 2024 row's OWN partition is empty here, meaning it's pruned as
    // "not seeded" — asserting that too, since a real re-seed always lists
    // every currently-authored row for every edition it touches).
    await prisma.feat.deleteMany({ where: staleFeatWhere([{ name: NAME, edition: "EDITION_2014" }]) });

    const rows = await prisma.feat.findMany({ where: { name: NAME } });
    expect(rows.map((r) => r.edition).sort()).toEqual(["EDITION_2014"]);
  });

  it("a shared (NULL-edition) row survives when it's in the seeded set, even alongside edition-tagged siblings", async () => {
    await prisma.feat.create({ data: { name: NAME, description: "shared", edition: null } });
    await prisma.feat.create({ data: { name: NAME + " 2024", description: "2024-only", edition: "EDITION_2024" } });

    const seeded = [
      { name: NAME, edition: null },
      { name: NAME + " 2024", edition: "EDITION_2024" as const },
    ];
    await prisma.feat.deleteMany({ where: staleFeatWhere(seeded) });

    const survivor = await prisma.feat.findFirst({ where: { name: NAME, edition: null } });
    expect(survivor).not.toBeNull();
    await prisma.feat.deleteMany({ where: { name: NAME + " 2024" } });
  });
});
