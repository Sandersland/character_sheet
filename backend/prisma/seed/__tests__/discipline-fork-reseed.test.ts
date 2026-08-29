import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

import { staleCatalogRowsWhere } from "../prune.js";

const DISCIPLINE_NAME = "Zzz Fork Reseed Discipline (#1503)";
const ORPHAN_NAME = "Zzz Fork Reseed Discipline Orphan (#1503)";

afterEach(async () => {
  await prisma.grantedAbility.deleteMany({ where: { name: { in: [DISCIPLINE_NAME, ORPHAN_NAME] } } });
});

describe("seedDisciplines' upsert is idempotent (#1503)", () => {
  it("running upsertEditionRow twice for the same (name, EDITION_2014) row updates in place, no duplicate", async () => {
    const data = {
      name: DISCIPLINE_NAME,
      source: "discipline",
      edition: "EDITION_2014" as const,
      description: "v1",
      minLevel: 3,
      alwaysKnown: false,
      costKind: "pool",
      costPoolKey: "ki",
      costBase: 1,
    };
    let last;
    for (let run = 0; run < 2; run += 1) {
      last = await upsertEditionRow(
        prisma.grantedAbility,
        { name: DISCIPLINE_NAME, edition: "EDITION_2014" },
        { ...data, description: run === 0 ? "v1" : "v2" },
        { description: run === 0 ? "v1" : "v2" },
      );
    }
    const rows = await prisma.grantedAbility.findMany({ where: { name: DISCIPLINE_NAME } });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(last!.id);
    expect(rows[0].description).toBe("v2");
    expect(rows[0].edition).toBe("EDITION_2014");
  });
});

describe("seedDisciplines' prune sweeps orphaned NULL-edition rows (#1503's own decision, 2026-08-03)", () => {
  it("an all-EDITION_2014 seeded list drops a NULL-edition row of the same name (the 17 pre-retirement orphans)", async () => {
    await prisma.grantedAbility.create({
      data: { name: ORPHAN_NAME, source: "discipline", description: "pre-retirement orphan", edition: null },
    });
    const retagged = await upsertEditionRow(
      prisma.grantedAbility,
      { name: ORPHAN_NAME, edition: "EDITION_2014" },
      { name: ORPHAN_NAME, source: "discipline", description: "current", edition: "EDITION_2014", minLevel: 3, alwaysKnown: false },
      { description: "current" },
    );

    // Scoped to this fixture's name — without it, staleCatalogRowsWhere would match the real 16-row discipline catalog too.
    const seededAllEdition2014 = [{ identity: ORPHAN_NAME, edition: "EDITION_2014" as const }];
    const staleWhere = staleCatalogRowsWhere("name", seededAllEdition2014, {
      source: "discipline",
      name: { in: [ORPHAN_NAME] },
    });
    await prisma.grantedAbility.deleteMany({ where: staleWhere });

    const surviving = await prisma.grantedAbility.findMany({ where: { name: ORPHAN_NAME } });
    expect(surviving).toHaveLength(1);
    expect(surviving[0].id).toBe(retagged.id);
    expect(surviving[0].edition).toBe("EDITION_2014");
  });
});

describe("integration: the real seeded discipline catalog (#1503)", () => {
  it("has exactly 16 source:\"discipline\" rows, all EDITION_2014, zero edition:NULL", async () => {
    const rows = await prisma.grantedAbility.findMany({ where: { source: "discipline" } });
    expect(rows).toHaveLength(16);
    expect(rows.every((r) => r.edition === "EDITION_2014")).toBe(true);
    expect(rows.some((r) => r.edition === null)).toBe(false);
  });

  it("Elemental Attunement is NOT in the catalog (it's a DerivedFeature, not a pickable option)", async () => {
    const row = await prisma.grantedAbility.findFirst({ where: { source: "discipline", name: "Elemental Attunement" } });
    expect(row).toBeNull();
  });
});
