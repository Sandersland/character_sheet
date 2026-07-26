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
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { staleCatalogRowsWhere } from "../prune.js";

describe("staleCatalogRowsWhere — edition-safe prune (#1306)", () => {
  const NAME = "Zzz Prune Probe (#1306)";
  const UNSEEDED_NAME = "Zzz Prune Probe Unrelated (#1306)";

  afterEach(async () => {
    await prisma.feat.deleteMany({ where: { name: { in: [NAME, UNSEEDED_NAME] } } });
    await prisma.grantedAbility.deleteMany({ where: { name: { in: [NAME, UNSEEDED_NAME] } } });
  });

  it("Feat: a same-named 2014/2024 pair — only the seeded edition survives, stably across repeated (idempotent) prune runs; an unrelated unseeded row is pruned too", async () => {
    await prisma.feat.create({ data: { name: NAME, description: "2014", edition: "EDITION_2014" } });
    await prisma.feat.create({ data: { name: NAME, description: "2024", edition: "EDITION_2024" } });
    await prisma.feat.create({ data: { name: UNSEEDED_NAME, description: "stale", edition: "EDITION_2014" } });

    const seeded = [{ name: NAME, edition: "EDITION_2014" as const }];
    await prisma.feat.deleteMany({ where: staleCatalogRowsWhere(seeded) });
    await prisma.feat.deleteMany({ where: staleCatalogRowsWhere(seeded) }); // idempotent — no-op the second time

    const survivingNames = (await prisma.feat.findMany({ where: { name: { in: [NAME, UNSEEDED_NAME] } } }))
      .map((r) => `${r.name}::${r.edition}`);
    expect(survivingNames).toEqual([`${NAME}::EDITION_2014`]);
  });

  it("Feat: a same-named NULL(shared)/2024 pair — only the seeded (NULL) partition survives", async () => {
    await prisma.feat.create({ data: { name: NAME, description: "shared", edition: null } });
    await prisma.feat.create({ data: { name: NAME, description: "2024-only", edition: "EDITION_2024" } });

    const seeded = [{ name: NAME, edition: null }];
    await prisma.feat.deleteMany({ where: staleCatalogRowsWhere(seeded) });

    const survivingEditions = (await prisma.feat.findMany({ where: { name: NAME } })).map((r) => r.edition);
    expect(survivingEditions).toEqual([null]);
  });

  // GrantedAbility.name stays plain @unique — no divergent row CAN exist there
  // yet (that needs a migration widening the constraint first), so this can't
  // use the same-name-pair shape the two Feat tests above do. It still proves
  // real discrimination without one: seed a single row tagged EDITION_2024,
  // but list it in the seeded set under `edition: null`. A naive name-only
  // notIn keeps it (the name string is present in the seeded list, full stop);
  // the correct partitioned form puts it in the EDITION_2024 partition, whose
  // seeded-names list is empty for this run, and deletes it.
  it("GrantedAbility: a row seeded under the WRONG edition is still pruned (partitioning discriminates without a same-name pair)", async () => {
    await prisma.grantedAbility.create({ data: { name: NAME, source: "shadowArts", description: "d", edition: "EDITION_2024" } });

    const seeded = [{ name: NAME, edition: null }];
    await prisma.grantedAbility.deleteMany({
      where: staleCatalogRowsWhere(seeded, { source: "shadowArts" }),
    });

    const survivor = await prisma.grantedAbility.findFirst({ where: { name: NAME } });
    expect(survivor).toBeNull();
  });
});
