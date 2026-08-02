// Proves a same-name GrantedAbility fork SURVIVES repeated seeding after #1415
// widened the key to (name, edition) — and, in the converse case, exactly when
// it does not.
//
// The issue's own AC ("run `prisma db seed` twice") has no in-process form:
// seed.ts exports nothing and self-invokes main() at module load, so a test
// cannot import and re-run it. The conversion under test is
// upsertEditionRow-vs-upsert, so running upsertEditionRow twice against a table
// that already holds same-name siblings proves the same property directly.
// seedShadowArts' prune is likewise reproduced by calling staleCatalogRowsWhere
// with the seeded list that function passes, for the same reason.
//
// Fixture rules: every row is uniquely named, and every destructive call is
// scoped to this file's own names — staleCatalogRowsWhere means "everything NOT
// in the seeded list", which without scoping matches the real catalog (see
// prune.test.ts's header).
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

import { staleCatalogRowsWhere } from "../prune.js";

const MANEUVER_NAME = "Zzz Fork Reseed Maneuver (#1415)";
const ART_NAME = "Zzz Fork Reseed Shadow Art (#1415)";
const ONLY_THIS_FILES_ROWS = { name: { in: [MANEUVER_NAME, ART_NAME] } };

afterEach(async () => {
  await prisma.grantedAbility.deleteMany({ where: ONLY_THIS_FILES_ROWS });
});

describe("a same-name fork survives reseeding (#1415)", () => {
  // source "maneuver" deliberately: seedManeuvers has no prune, so this
  // isolates the upsertEditionRow conversion from the prune behaviour the
  // converse case below covers.
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
    // Same id ⇒ updated, not duplicated: a findFirst that missed the NULL row
    // would have created a second one, which NULLS NOT DISTINCT then rejects.
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

    // The shape seedShadowArts passes today: `SHADOW_ARTS.map(a => ({ identity: a.name, edition: null }))`.
    // The name IS declared, but only in the null partition — the 2014/2024
    // partitions get `notIn: []`, which matches everything in them.
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

    // What #1313 must do: ShadowArtSeed gains `edition?: SeedEdition` and
    // seedShadowArts maps `{ identity: a.name, edition: a.edition ?? null }`.
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

// #1229: seedChannelDivinities had NO prune at all before this issue —
// retagging "Channel Divinity: Turn the Unholy" (and its two siblings) from
// `edition: null` to `EDITION_2014` creates a NEW row via upsertEditionRow's
// findFirst-by-(name,edition) and ORPHANS the pre-existing NULL row unless
// something deletes it. Converse of the shadowArts case above: proves (a) the
// new prune drops the orphaned NULL row on reseed and (b) the freshly-tagged
// EDITION_2014 row survives the SAME prune call.
const CD_NAME = "Zzz Fork Reseed Channel Divinity (#1229)";
describe("seedChannelDivinities' new prune (#1229) drops an orphaned shared row left behind by an edition retag", () => {
  afterEach(async () => {
    await prisma.grantedAbility.deleteMany({ where: { name: CD_NAME } });
  });

  it("retagging a previously-shared option to EDITION_2014 orphans the NULL row, and the new prune drops only that orphan", async () => {
    // Simulates the pre-#1229 database state: a shared (edition: null) row,
    // as every CHANNEL_DIVINITIES entry was before this issue.
    const orphan = await prisma.grantedAbility.create({
      data: { name: CD_NAME, source: "channelDivinity", description: "pre-retag shared text", edition: null },
    });

    // The retag itself: upsertEditionRow with the NEW (name, EDITION_2014)
    // key can't find the NULL row (different key), so it creates a sibling —
    // exactly what seedChannelDivinities' main loop does today.
    const retagged = await upsertEditionRow(
      prisma.grantedAbility,
      { name: CD_NAME, edition: "EDITION_2014" },
      { name: CD_NAME, source: "channelDivinity", description: "retagged 2014 text", edition: "EDITION_2014" },
      { description: "retagged 2014 text" },
    );

    // What seedChannelDivinities now passes: each row's OWN edition, never a
    // flat null — the shape this issue's prune adds.
    const seededAsRetagged = [{ identity: CD_NAME, edition: "EDITION_2014" as const }];
    await prisma.grantedAbility.deleteMany({
      where: staleCatalogRowsWhere("name", seededAsRetagged, { source: "channelDivinity" }),
    });

    const surviving = await prisma.grantedAbility.findMany({ where: { name: CD_NAME } });
    expect(surviving).toHaveLength(1);
    expect(surviving[0].id).toBe(retagged.id);
    expect(surviving[0].edition).toBe("EDITION_2014");
    // The orphaned NULL row (which withEditionOrShared's null-is-shared
    // fallback would otherwise keep serving to a 2024 Paladin forever) is
    // gone.
    expect(surviving.some((r) => r.id === orphan.id)).toBe(false);
  });
});
