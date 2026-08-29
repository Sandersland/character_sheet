// Every row uses a Zzz-prefixed name unique to this file so staleCatalogRowsWhere's "everything NOT in the seeded list" scope never touches the real seeded catalog.
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

import { staleCatalogRowsWhere } from "../prune.js";

const FS_NAME = "Zzz Fork Reseed Fighting Style (#1311)";

const BASE_FEAT = {
  name: FS_NAME,
  description: "placeholder",
  category: "fighting_style" as const,
  levelPrerequisite: null,
  repeatable: false,
  prerequisite: "Fighting Style feature",
  abilityOptions: [] as string[],
  abilityIncrease: 0,
  improvements: [] as unknown as object,
};

afterEach(async () => {
  await prisma.feat.deleteMany({ where: { name: FS_NAME } });
});

describe("retagging a shared fighting_style row to EDITION_2024 orphans it, and the new prune drops only the orphan (#1311)", () => {
  it("the retagged EDITION_2024 row and a freshly-seeded EDITION_2014 sibling both survive; the pre-retag NULL row does not", async () => {
    const orphan = await prisma.feat.create({
      data: { ...BASE_FEAT, description: "pre-retag shared text", edition: null },
    });

    // upsertEditionRow keys on (name, edition), so the NEW (name, EDITION_2024) key can't find the NULL row and creates a sibling instead.
    const retagged2024 = await upsertEditionRow(
      prisma.feat,
      { name: FS_NAME, edition: "EDITION_2024" },
      { ...BASE_FEAT, description: "retagged 2024 text", edition: "EDITION_2024" },
      { description: "retagged 2024 text" },
    );

    const created2014 = await upsertEditionRow(
      prisma.feat,
      { name: FS_NAME, edition: "EDITION_2014" },
      { ...BASE_FEAT, description: "2014 text", edition: "EDITION_2014" },
      { description: "2014 text" },
    );

    const seededAsRetagged = [
      { identity: FS_NAME, edition: "EDITION_2024" as const },
      { identity: FS_NAME, edition: "EDITION_2014" as const },
    ];
    await prisma.feat.deleteMany({
      where: staleCatalogRowsWhere("name", seededAsRetagged, { name: FS_NAME }),
    });

    const surviving = await prisma.feat.findMany({ where: { name: FS_NAME } });
    expect(surviving).toHaveLength(2);
    expect(surviving.map((r) => r.id).sort()).toEqual([retagged2024.id, created2014.id].sort());
    expect(surviving.map((r) => r.edition).sort()).toEqual(["EDITION_2014", "EDITION_2024"]);
    // Without this prune, withEditionOrShared's null-is-shared fallback would keep serving the orphaned NULL row to a 2014 character forever.
    expect(surviving.some((r) => r.id === orphan.id)).toBe(false);
  });

  it("running the retag's upsertEditionRow twice updates each fork in place rather than duplicating it", async () => {
    await prisma.feat.create({
      data: { ...BASE_FEAT, description: "2024 v1", edition: "EDITION_2024" },
    });
    await prisma.feat.create({
      data: { ...BASE_FEAT, description: "2014 v1", edition: "EDITION_2014" },
    });

    for (let run = 0; run < 2; run += 1) {
      await upsertEditionRow(
        prisma.feat,
        { name: FS_NAME, edition: "EDITION_2024" },
        { ...BASE_FEAT, description: "2024 v2", edition: "EDITION_2024" },
        { description: "2024 v2" },
      );
      await upsertEditionRow(
        prisma.feat,
        { name: FS_NAME, edition: "EDITION_2014" },
        { ...BASE_FEAT, description: "2014 v2", edition: "EDITION_2014" },
        { description: "2014 v2" },
      );
    }

    const rows = await prisma.feat.findMany({ where: { name: FS_NAME } });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.edition === "EDITION_2024")!.description).toBe("2024 v2");
    expect(rows.find((r) => r.edition === "EDITION_2014")!.description).toBe("2014 v2");
  });
});
