/**
 * DB-level proof for #1306's two load-bearing claims that a pure unit test
 * can't make (see catalog-edition.test.ts for resolveEditionRow's pure logic):
 *
 * 1. NULLS NOT DISTINCT actually rejects two NULL-edition rows sharing a name
 *    at the Postgres constraint level, not just in application code.
 * 2. The worked example (Alert forks by edition; Grappler stays one shared
 *    row) resolves correctly against the REAL seeded catalog, not a fixture.
 */
import { afterEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { resolveEditionRow } from "@/lib/rules/catalog-edition.js";

describe("NULLS NOT DISTINCT — Feat(name, edition) rejects a duplicate NULL row", () => {
  const NAME = "Zzz NULLS-NOT-DISTINCT Probe (#1306)";

  afterEach(async () => {
    await prisma.feat.deleteMany({ where: { name: NAME } });
  });

  it("a second NULL-edition row sharing the first's name is rejected by the database", async () => {
    await prisma.feat.create({ data: { name: NAME, description: "first", edition: null } });

    // Assert BOTH that it throws Prisma's known-request-error type AND that
    // its code is P2002 (unique violation) — proving this is Postgres's
    // NULLS NOT DISTINCT constraint rejecting the row, not a coincidental
    // application-level throw.
    let error: unknown;
    try {
      await prisma.feat.create({ data: { name: NAME, description: "second", edition: null } });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");
  });

  it("two rows with the same name but DIFFERENT non-null editions are both allowed", async () => {
    await prisma.feat.create({ data: { name: NAME, description: "2014", edition: "EDITION_2014" } });
    await prisma.feat.create({ data: { name: NAME, description: "2024", edition: "EDITION_2024" } });
    const rows = await prisma.feat.findMany({ where: { name: NAME } });
    expect(rows.map((r) => r.edition).sort()).toEqual(["EDITION_2014", "EDITION_2024"]);
  });
});

describe("worked example against the real seeded catalog (#1306)", () => {
  it("Alert resolves to a different row per edition; Grappler resolves to the same shared row", async () => {
    const alertRows = await prisma.feat.findMany({
      where: { name: "Alert" },
      select: { id: true, edition: true, improvements: true },
    });
    expect(alertRows).toHaveLength(2);

    const alert2014 = resolveEditionRow(alertRows, "EDITION_2014");
    const alert2024 = resolveEditionRow(alertRows, "EDITION_2024");
    expect(alert2014).toBeDefined();
    expect(alert2024).toBeDefined();
    expect(alert2014!.id).not.toBe(alert2024!.id);
    expect(alert2014!.improvements).toEqual([{ target: "initiative", amount: 5 }]);
    expect(alert2024!.improvements).toEqual([{ target: "initiative", amount: 1, scaling: "proficiencyBonus" }]);

    const grapplerRows = await prisma.feat.findMany({
      where: { name: "Grappler" },
      select: { id: true, edition: true },
    });
    expect(grapplerRows).toHaveLength(1);
    const grappler2014 = resolveEditionRow(grapplerRows, "EDITION_2014");
    const grappler2024 = resolveEditionRow(grapplerRows, "EDITION_2024");
    expect(grappler2014).toBeDefined();
    expect(grappler2014!.id).toBe(grappler2024!.id);
  });

  it("neither edition resolves a name absent from the catalog", async () => {
    const rows = await prisma.feat.findMany({ where: { name: "Not A Real Feat (#1306)" } });
    expect(resolveEditionRow(rows, "EDITION_2014")).toBeUndefined();
    expect(resolveEditionRow(rows, "EDITION_2024")).toBeUndefined();
  });
});
