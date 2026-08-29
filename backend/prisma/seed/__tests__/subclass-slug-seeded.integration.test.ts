// Scoped to SUBCLASS_SLUGS membership, not the table's total row count, because sibling test files (e.g. granted-stale-level.test.ts) leak their own throwaway Subclass rows into this shared worker DB.
import { describe, it, expect } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { SUBCLASSES } from "../subclasses.js";
import { SUBCLASS_SLUGS } from "@/lib/classes/subclass-slug.js";

describe("Subclass catalog is seeded with slugs (#1277)", () => {
  it("every SUBCLASSES row is seeded with its exact (class, name, slug)", async () => {
    for (const sub of SUBCLASSES) {
      const row = await prisma.subclass.findFirst({
        // Matches this row's own seeded edition tag, not a hardcoded null — Path of the Totem Warrior seeds EDITION_2014, not shared (#1559).
        where: { name: sub.name, edition: sub.edition ?? null, class: { name: sub.className } },
        select: { slug: true },
      });
      expect(row, `missing seeded row: ${sub.className}/${sub.name}`).not.toBeNull();
      expect(row?.slug, `${sub.className}/${sub.name} seeded with the wrong slug`).toBe(sub.slug);
    }
  });

  it("exactly SUBCLASSES.length rows carry a slug in SUBCLASS_SLUGS", async () => {
    const count = await prisma.subclass.count({ where: { slug: { in: [...SUBCLASS_SLUGS] } } });
    expect(count).toBe(SUBCLASSES.length);
  });
});
