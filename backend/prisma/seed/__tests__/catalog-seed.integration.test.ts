// DB-touching pin (#1796, epic #1795 1/6): the acceptance checklist promises
// "`prisma db seed` creates one CatalogEntry(scope=GLOBAL, kind=SPELL) per
// seeded spell, linked 1:1 to its Spell" — nothing else in the suite asserts
// this directly against the REAL seeded catalog (catalog-entry.integration
// .test.ts pins the constraints in isolation, on throwaway fixture rows).
// Runs against every real seeded Spell row, not a sample: a shape-only spot
// check would miss a single stray spell a future content slice adds without
// wiring its CatalogEntry correctly.
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

describe("seedSpells' CatalogEntry linkage (#1796)", () => {
  it("gives every seeded Spell a GLOBAL/SPELL CatalogEntry, linked 1:1 with matching name/edition, no orphans", async () => {
    const spells = await prisma.spell.findMany({
      select: { id: true, name: true, edition: true, catalogEntryId: true },
    });
    expect(spells.length).toBeGreaterThan(0);

    const entries = await prisma.catalogEntry.findMany({
      where: { id: { in: spells.map((s) => s.catalogEntryId) } },
      select: { id: true, kind: true, scope: true, name: true, edition: true, ownerUserId: true, ownerCampaignId: true },
    });
    const entryById = new Map(entries.map((e) => [e.id, e]));

    // No orphans: every Spell.catalogEntryId resolves to a real CatalogEntry
    // row (the hand-written FK already enforces this at write time — this is
    // the read-side proof it held for the whole real catalog, not just one
    // fixture write).
    const orphaned = spells.filter((s) => !entryById.has(s.catalogEntryId));
    expect(orphaned.map((s) => s.name)).toEqual([]);

    for (const spell of spells) {
      const entry = entryById.get(spell.catalogEntryId)!;
      expect(entry, `Spell "${spell.name}" (${spell.edition}) has no linked CatalogEntry`).toBeDefined();
      expect(entry.kind, `"${spell.name}" entry.kind`).toBe("SPELL");
      expect(entry.scope, `"${spell.name}" entry.scope`).toBe("GLOBAL");
      expect(entry.ownerUserId, `"${spell.name}" entry.ownerUserId`).toBeNull();
      expect(entry.ownerCampaignId, `"${spell.name}" entry.ownerCampaignId`).toBeNull();
      // No name/edition mismatches: the entry's own business-key fields must
      // agree with the Spell row they back, or a future rename/reseed drift
      // (applySpellRenames touching one but not the other) would go unnoticed.
      expect(entry.name, `"${spell.name}" entry.name mismatch`).toBe(spell.name);
      expect(entry.edition, `"${spell.name}" entry.edition mismatch`).toBe(spell.edition);
    }

    // 1:1: as many distinct CatalogEntry ids as Spell rows — a duplicate
    // (two spells sharing one entry) would violate Spell.catalogEntryId's own
    // unique constraint at write time, but this is the read-side proof.
    expect(new Set(spells.map((s) => s.catalogEntryId)).size).toBe(spells.length);
  });
});
