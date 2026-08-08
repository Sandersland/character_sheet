// DB-touching pin (#1796, epic #1795 1/6): the acceptance checklist promises
// "`prisma db seed` creates one CatalogEntry(scope=GLOBAL, kind=SPELL) per
// seeded spell, linked 1:1 to its Spell" — nothing else in the suite asserts
// this directly against the REAL seeded catalog (catalog-entry.integration
// .test.ts pins the constraints in isolation, on throwaway fixture rows).
// Runs against every real seeded Spell row, not a sample: a shape-only spot
// check would miss a single stray spell a future content slice adds without
// wiring its CatalogEntry correctly.
//
// Scoped to the seed's own identity set, not a blind `spell.findMany()`
// (flaked on multiple unrelated PRs, e.g. "Test Firebolt Catalog"
// entry.edition mismatch: expected 'EDITION_2024' to be null): the vitest
// worker's Postgres database is shared across every test FILE in the run,
// not isolated per file (vitest.global-setup.ts clones one database per
// WORKER, #1269) — item-scope.integration.test.ts's header documents the
// same constraint. A whole-table scan races long-lived fixtures like
// spells.test.ts's "Test Firebolt Catalog" (created in a `beforeAll`, torn
// down only in that describe block's own `afterAll`), which is a false
// failure, not a real seed bug. `[...SPELLS, ...SPELLS_2014]` is exactly the
// set seedSpells (prisma/seed.ts) iterates to upsert Spell rows — the same
// class-table-columns.test.ts pattern (scope to the known seeded identity
// set, e.g. `CLASSES.map(c => c.name)`) applied to Spell's forked (name,
// edition) key instead of a bare name. This still fails on a genuine seed
// bug: any of these exact rows missing/misconfigured on the real catalog
// still fails the assertions below — it only stops crediting a foreign
// test's transient row as if it were seed output.
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { SPELLS } from "../spells.js";
import { SPELLS_2014 } from "../spells-2014/index.js";

// Mirrors prisma/seed.ts's own (unexported) resolvedSpellEdition: seed.ts
// self-invokes `main()` at module load (see spell-fork-reseed.test.ts's
// header), so a test cannot import it directly — coupling latch: if
// resolvedSpellEdition's default ever changes, update this too.
//
// Deduped by (name, edition): upsertEditionRow means two identical entries
// (a content typo, not a linkage bug this test is about) would collapse to
// one Spell row, and the count assertion below shouldn't couple itself to
// "SPELLS/SPELLS_2014 contain no duplicate rows" — that's a different
// invariant, already caught by assertSeedContentValid at seed time.
const SEEDED_SPELL_IDENTITY = [
  ...new Map(
    [...SPELLS, ...SPELLS_2014].map((s) => {
      const edition = s.edition ?? "EDITION_2024";
      return [`${s.name}::${edition}`, { name: s.name, edition }] as const;
    }),
  ).values(),
];

describe("seedSpells' CatalogEntry linkage (#1796)", () => {
  it("gives every seeded Spell a GLOBAL/SPELL CatalogEntry, linked 1:1 with matching name/edition, no orphans", async () => {
    const spells = await prisma.spell.findMany({
      where: { OR: SEEDED_SPELL_IDENTITY },
      select: { id: true, name: true, edition: true, catalogEntryId: true },
    });
    expect(spells.length).toBe(SEEDED_SPELL_IDENTITY.length);

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
