// DB-touching pin (#1277, AC 5 corrected — seed-data.test.ts is pure-data and
// cannot pin a SEEDED table): asserts the worker DB's Subclass table, after
// `prisma db seed` ran in vitest.db.ts's buildTemplate, carries every row
// SUBCLASSES declares with the slug the seed wrote (not a leftover/derived
// value). Fails before the migration (unknown column "slug") and fails before
// seedSubclasses writes slugs (NULL would violate the NOT NULL constraint the
// migration adds).
//
// Scoped to SUBCLASS_SLUGS membership rather than the table's total row count
// or a full-table set-equality: several OTHER test files (e.g.
// granted-stale-level.test.ts) create their own throwaway Subclass rows under
// a test-only CharacterClass with no afterAll cleanup, and share this
// worker's DB across the full suite run — a stricter assertion here would be
// a false negative on THEIR fixture leak, not a regression in this seed.
import { describe, it, expect } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { SUBCLASSES } from "../subclasses.js";
import { SUBCLASS_SLUGS } from "@/lib/classes/subclass-slug.js";

describe("Subclass catalog is seeded with slugs (#1277)", () => {
  it("every SUBCLASSES row is seeded with its exact (class, name, slug)", async () => {
    for (const sub of SUBCLASSES) {
      const row = await prisma.subclass.findFirst({
        // edition matches this row's OWN seeded tag, not a hardcoded null —
        // Path of the Totem Warrior seeds EDITION_2014, not shared (#1559).
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
