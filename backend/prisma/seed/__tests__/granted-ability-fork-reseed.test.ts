import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

import { staleCatalogRowsWhere } from "../prune.js";
import { SHADOW_ARTS } from "../shadow-arts.js";

const MANEUVER_NAME = "Zzz Fork Reseed Maneuver (#1415)";
const ART_NAME = "Zzz Fork Reseed Shadow Art (#1415)";
const ONLY_THIS_FILES_ROWS = { name: { in: [MANEUVER_NAME, ART_NAME] } };

afterEach(async () => {
  await prisma.grantedAbility.deleteMany({ where: ONLY_THIS_FILES_ROWS });
});

describe("a same-name fork survives reseeding (#1415)", () => {
  it("upsertEditionRow run twice updates the shared row in place and leaves both forks untouched", async () => {
    const shared = await prisma.grantedAbility.create({
      data: { name: MANEUVER_NAME, source: "maneuver", description: "shared v1", edition: null },
    });
    await prisma.grantedAbility.create({
      data: { name: MANEUVER_NAME, source: "maneuver", description: "2014", edition: "EDITION_2014" },
    });
    await prisma.grantedAbility.create({
      data: { name: MANEUVER_NAME, source: "maneuver", description: "2024", edition: "EDITION_2024" },
    });

    const create = { name: MANEUVER_NAME, source: "maneuver", description: "shared v2", edition: null };
    for (let run = 0; run < 2; run += 1) {
      await upsertEditionRow(
        prisma.grantedAbility,
        { name: MANEUVER_NAME, edition: null },
        create,
        { description: "shared v2" },
      );
    }

    const rows = await prisma.grantedAbility.findMany({
      where: { name: MANEUVER_NAME },
      orderBy: { description: "asc" },
    });
    expect(rows).toHaveLength(3);
    // Same id ⇒ updated in place; a missed NULL-row match would insert a duplicate and hit NULLS NOT DISTINCT.
    expect(rows.find((r) => r.edition === null)!.id).toBe(shared.id);
    expect(rows.find((r) => r.edition === null)!.description).toBe("shared v2");
    expect(rows.find((r) => r.edition === "EDITION_2014")!.description).toBe("2014");
    expect(rows.find((r) => r.edition === "EDITION_2024")!.description).toBe("2024");
  });
});

describe("the converse: an undeclared fork is pruned (#1313's remaining work)", () => {
  it("seedShadowArts' seeded list, which carries edition: null only, deletes both forks", async () => {
    await prisma.grantedAbility.create({
      data: { name: ART_NAME, source: "shadowArts", description: "shared", edition: null },
    });
    await prisma.grantedAbility.create({
      data: { name: ART_NAME, source: "shadowArts", description: "2014", edition: "EDITION_2014" },
    });
    await prisma.grantedAbility.create({
      data: { name: ART_NAME, source: "shadowArts", description: "2024", edition: "EDITION_2024" },
    });

    // A flat-null seeded list leaves the 2014/2024 partitions with `notIn: []`, which matches (and deletes) everything in them.
    const seededAsToday = [{ identity: ART_NAME, edition: null }];
    await prisma.grantedAbility.deleteMany({
      where: staleCatalogRowsWhere("name", seededAsToday, { source: "shadowArts", ...ONLY_THIS_FILES_ROWS }),
    });

    const surviving = (await prisma.grantedAbility.findMany({ where: { name: ART_NAME } })).map((r) => r.edition);
    expect(surviving).toEqual([null]);
  });

  it("threading each row's own edition into the seeded list is what preserves them", async () => {
    await prisma.grantedAbility.create({
      data: { name: ART_NAME, source: "shadowArts", description: "2014", edition: "EDITION_2014" },
    });
    await prisma.grantedAbility.create({
      data: { name: ART_NAME, source: "shadowArts", description: "2024", edition: "EDITION_2024" },
    });

    const seededWithEditions = [
      { identity: ART_NAME, edition: "EDITION_2014" as const },
      { identity: ART_NAME, edition: "EDITION_2024" as const },
    ];
    await prisma.grantedAbility.deleteMany({
      where: staleCatalogRowsWhere("name", seededWithEditions, { source: "shadowArts", ...ONLY_THIS_FILES_ROWS }),
    });

    const surviving = (await prisma.grantedAbility.findMany({ where: { name: ART_NAME } })).map((r) => r.edition);
    expect(surviving.sort()).toEqual(["EDITION_2014", "EDITION_2024"]);
  });
});

// No afterEach here: reseeding the real catalog twice returns it to its starting state, unlike the fixture-based tests above.
describe("the real SHADOW_ARTS catalog round-trips a reseed (#1502)", () => {
  it("seeding twice leaves exactly 5 rows — 4 EDITION_2014 + 1 EDITION_2024 — with Darkness once per edition", async () => {
    for (let run = 0; run < 2; run += 1) {
      for (const art of SHADOW_ARTS) {
        const data = {
          name: art.name,
          edition: art.edition,
          source: "shadowArts",
          description: art.description,
          minLevel: 3,
          alwaysKnown: true,
          costKind: "pool",
          costPoolKey: art.costPoolKey,
          costBase: art.costBase,
          costPerStep: null,
          effectKind: null,
          buffTarget: null,
          buffModifier: null,
        };
        await upsertEditionRow(prisma.grantedAbility, { name: art.name, edition: art.edition }, data, data);
      }
      const staleWhere = staleCatalogRowsWhere(
        "name",
        SHADOW_ARTS.map((a) => ({ identity: a.name, edition: a.edition })),
        { source: "shadowArts" },
      );
      await prisma.grantedAbility.deleteMany({ where: staleWhere });
    }

    const rows = await prisma.grantedAbility.findMany({ where: { source: "shadowArts" } });
    expect(rows).toHaveLength(5);
    expect(rows.filter((r) => r.edition === "EDITION_2014")).toHaveLength(4);
    expect(rows.filter((r) => r.edition === "EDITION_2024")).toHaveLength(1);
    const darkness = rows.filter((r) => r.name === "Shadow Arts: Darkness");
    expect(darkness.map((r) => r.edition).sort()).toEqual(["EDITION_2014", "EDITION_2024"]);
  });
});

// Retagging a row's edition mints a NEW row via upsertEditionRow's (name, edition) key — the old NULL row is orphaned unless pruned.
const CD_NAME = "Zzz Fork Reseed Channel Divinity (#1229)";
describe("seedChannelDivinities' new prune (#1229) drops an orphaned shared row left behind by an edition retag", () => {
  afterEach(async () => {
    await prisma.grantedAbility.deleteMany({ where: { name: CD_NAME } });
  });

  it("retagging a previously-shared option to EDITION_2014 orphans the NULL row, and the new prune drops only that orphan", async () => {
    const orphan = await prisma.grantedAbility.create({
      data: { name: CD_NAME, source: "channelDivinity", description: "pre-retag shared text", edition: null },
    });

    const retagged = await upsertEditionRow(
      prisma.grantedAbility,
      { name: CD_NAME, edition: "EDITION_2014" },
      { name: CD_NAME, source: "channelDivinity", description: "retagged 2014 text", edition: "EDITION_2014" },
      { description: "retagged 2014 text" },
    );

    const seededAsRetagged = [{ identity: CD_NAME, edition: "EDITION_2014" as const }];
    await prisma.grantedAbility.deleteMany({
      where: staleCatalogRowsWhere("name", seededAsRetagged, { source: "channelDivinity" }),
    });

    const surviving = await prisma.grantedAbility.findMany({ where: { name: CD_NAME } });
    expect(surviving).toHaveLength(1);
    expect(surviving[0].id).toBe(retagged.id);
    expect(surviving[0].edition).toBe("EDITION_2014");
    // The orphaned NULL row — which withEditionOrShared's null-is-shared fallback would otherwise keep serving to any edition — is gone.
    expect(surviving.some((r) => r.id === orphan.id)).toBe(false);
  });
});
