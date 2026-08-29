// staleCatalogRowsWhere's `seeded` list here is deliberately tiny, and its where means "everything NOT in this list" — called with no `extraWhere`, every destructive call below would match and delete the real seeded catalog.
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ALL_RULES_EDITIONS } from "@/lib/rules/edition.js";

import type { SeedEdition } from "../edition.js";
import { staleCatalogRowsWhere } from "../prune.js";

// staleCatalogRowsWhere has no explicit return-type annotation, deliberately, so it stays assignable to every model's WhereInput; Array.isArray narrows the inferred AND to a tuple for this test only.
describe("staleCatalogRowsWhere — partitions over every edition in the set (#1527)", () => {
  it("builds one OR-branch per ALL_RULES_EDITIONS member, plus the null/shared branch", () => {
    const where = staleCatalogRowsWhere("name", []);
    if (!Array.isArray(where.AND)) throw new Error("expected AND to be an array");
    const orClause = where.AND[1];
    if (!orClause || !("OR" in orClause) || !Array.isArray(orClause.OR)) {
      throw new Error("expected AND[1] to carry an OR array");
    }
    const branchEditions = orClause.OR.map((clause: { edition: SeedEdition | null }) => clause.edition);
    expect(branchEditions).toEqual([null, ...ALL_RULES_EDITIONS]);
  });
});

describe("staleCatalogRowsWhere — edition-safe prune (#1306)", () => {
  const NAME = "Zzz Prune Probe (#1306)";
  const UNSEEDED_NAME = "Zzz Prune Probe Unrelated (#1306)";
  const ONLY_THIS_FILES_ROWS = { name: { in: [NAME, UNSEEDED_NAME] } };

  afterEach(async () => {
    await prisma.feat.deleteMany({ where: ONLY_THIS_FILES_ROWS });
    await prisma.grantedAbility.deleteMany({ where: ONLY_THIS_FILES_ROWS });
  });

  afterAll(async () => {
    const alert = await prisma.feat.findFirst({ where: { name: "Alert" } });
    expect(alert, "the real seeded Feat catalog must survive this suite").not.toBeNull();
    const darkness = await prisma.grantedAbility.findFirst({ where: { name: "Shadow Arts: Darkness" } });
    expect(darkness, "the real seeded GrantedAbility catalog must survive this suite").not.toBeNull();
  });

  it("Feat: a same-named 2014/2024 pair — only the seeded edition survives, stably across repeated (idempotent) prune runs; an unrelated unseeded row is pruned too", async () => {
    await prisma.feat.create({ data: { name: NAME, description: "2014", edition: "EDITION_2014" } });
    await prisma.feat.create({ data: { name: NAME, description: "2024", edition: "EDITION_2024" } });
    await prisma.feat.create({ data: { name: UNSEEDED_NAME, description: "stale", edition: "EDITION_2014" } });

    const seeded = [{ identity: NAME, edition: "EDITION_2014" as const }];
    await prisma.feat.deleteMany({ where: staleCatalogRowsWhere("name", seeded, ONLY_THIS_FILES_ROWS) });
    await prisma.feat.deleteMany({ where: staleCatalogRowsWhere("name", seeded, ONLY_THIS_FILES_ROWS) });

    const survivingNames = (await prisma.feat.findMany({ where: { name: { in: [NAME, UNSEEDED_NAME] } } }))
      .map((r) => `${r.name}::${r.edition}`);
    expect(survivingNames).toEqual([`${NAME}::EDITION_2014`]);
  });

  it("Feat: a same-named NULL(shared)/2024 pair — only the seeded (NULL) partition survives", async () => {
    await prisma.feat.create({ data: { name: NAME, description: "shared", edition: null } });
    await prisma.feat.create({ data: { name: NAME, description: "2024-only", edition: "EDITION_2024" } });

    const seeded = [{ identity: NAME, edition: null }];
    await prisma.feat.deleteMany({ where: staleCatalogRowsWhere("name", seeded, ONLY_THIS_FILES_ROWS) });

    const survivingEditions = (await prisma.feat.findMany({ where: { name: NAME } })).map((r) => r.edition);
    expect(survivingEditions).toEqual([null]);
  });

  it("GrantedAbility: a same-named 2014/2024 pair — only the seeded edition survives", async () => {
    await prisma.grantedAbility.create({ data: { name: NAME, source: "shadowArts", description: "2014", edition: "EDITION_2014" } });
    await prisma.grantedAbility.create({ data: { name: NAME, source: "shadowArts", description: "2024", edition: "EDITION_2024" } });

    const seeded = [{ identity: NAME, edition: "EDITION_2014" as const }];
    await prisma.grantedAbility.deleteMany({
      where: staleCatalogRowsWhere("name", seeded, { source: "shadowArts", ...ONLY_THIS_FILES_ROWS }),
    });

    const surviving = (await prisma.grantedAbility.findMany({ where: { name: NAME } })).map((r) => r.edition);
    expect(surviving).toEqual(["EDITION_2014"]);
  });
});
