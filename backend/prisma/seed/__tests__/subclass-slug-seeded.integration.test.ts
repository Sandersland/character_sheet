// DB-touching pin (#1277, AC 5 corrected — seed-data.test.ts is pure-data and
// cannot pin a SEEDED table): asserts the worker DB's Subclass table, after
// `prisma db seed` ran in vitest.db.ts's buildTemplate, has exactly the 31
// rows SUBCLASSES declares, each carrying the slug the seed wrote (not a
// leftover/derived value), and that (className, name) is unchanged from
// today's catalog. Fails before the migration (unknown column "slug") and
// fails before seedSubclasses writes slugs (NULL would violate the NOT NULL
// constraint the migration adds).
import { describe, it, expect } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { SUBCLASSES } from "../subclasses.js";
import { SUBCLASS_SLUGS } from "@/lib/classes/subclass-slug.js";

describe("Subclass catalog is seeded with slugs (#1277)", () => {
  it("has exactly SUBCLASSES.length rows", async () => {
    const count = await prisma.subclass.count();
    expect(count).toBe(SUBCLASSES.length);
  });

  it("every row's slug is a member of SUBCLASS_SLUGS", async () => {
    const rows = await prisma.subclass.findMany({ select: { slug: true } });
    const bad = rows.filter((r) => !(SUBCLASS_SLUGS as readonly string[]).includes(r.slug));
    expect(bad, "seeded row with a slug outside SUBCLASS_SLUGS").toEqual([]);
  });

  it("every seeded (className, name) pair is byte-identical to today's SUBCLASSES", async () => {
    const rows = await prisma.subclass.findMany({
      select: { name: true, slug: true, class: { select: { name: true } } },
    });
    const seededPairs = new Set(rows.map((r) => `${r.class.name}::${r.name}::${r.slug}`));
    const declaredPairs = new Set(SUBCLASSES.map((s) => `${s.className}::${s.name}::${s.slug}`));
    expect([...seededPairs].sort()).toEqual([...declaredPairs].sort());
  });
});
