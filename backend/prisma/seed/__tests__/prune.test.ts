// DB-backed proof for #1306's edition-safe prune (unlike seed-data.test.ts,
// this touches Postgres). Every test here creates a SAME-NAMED pair of rows
// under different editions — that pairing is load-bearing: a naive `notIn`
// on name ALONE would keep or drop both rows together (it only ever sees the
// shared name string), so only a same-name pair can prove staleCatalogRowsWhere's
// per-edition partitioning is actually doing something a plain notIn isn't.
// (The 2014 Mobile feat's real deletion had a different, simpler cause — it
// was dropped from FEATS entirely when the 2024 rewrite landed, not shadowed
// by a same-named sibling — but the fix generalizes to the harder case: a
// same-named row under an edition NOT in the current seed run is correctly
// pruned on its own, without silently taking a same-named different-edition
// row with it.)
//
// CI-caught footgun: staleCatalogRowsWhere's `seeded` list here is
// deliberately tiny (just this file's own fixture names), and its where means
// "everything NOT in this list" — called with no `extraWhere`, that where
// matches the REAL seeded catalog too (every one of the ~38 real Feat rows,
// every real GrantedAbility row), and deleteMany does not ask before dropping
// them. Every destructive call below MUST pass `extraWhere` scoping to this
// file's own fixture names, or it prunes the shared catalog out from under
// every other test in the same vitest worker.
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { staleCatalogRowsWhere } from "../prune.js";

describe("staleCatalogRowsWhere — edition-safe prune (#1306)", () => {
  const NAME = "Zzz Prune Probe (#1306)";
  const UNSEEDED_NAME = "Zzz Prune Probe Unrelated (#1306)";
  // Passed as staleCatalogRowsWhere's extraWhere on every destructive call in
  // this file — without it, "everything not in the tiny seeded list" means
  // the real catalog (see the file-header comment).
  const ONLY_THIS_FILES_ROWS = { name: { in: [NAME, UNSEEDED_NAME] } };

  afterEach(async () => {
    await prisma.feat.deleteMany({ where: ONLY_THIS_FILES_ROWS });
    await prisma.grantedAbility.deleteMany({ where: ONLY_THIS_FILES_ROWS });
  });

  // Proves the scoping fix didn't cost the real catalog: if any test above
  // leaked past its own fixture names, this is what would go red.
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
    await prisma.feat.deleteMany({ where: staleCatalogRowsWhere("name", seeded, ONLY_THIS_FILES_ROWS) }); // idempotent — no-op the second time

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

  // Uses the same same-name-pair shape as the two Feat tests above — which
  // #1415 made expressible (the second create P2002'd against the old plain
  // @unique on `name`), so the partitioning is now proven on GrantedAbility by
  // the same argument, not by a weaker wrong-edition-only stand-in.
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
