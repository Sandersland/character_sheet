// The vitest worker's DB is shared across test files, so this scopes to the seed's own identity set instead of a blind findMany() that could catch a foreign fixture row.
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { SPELLS } from "../spells.js";
import { SPELLS_2014 } from "../spells-2014/index.js";

// Coupling latch: mirrors prisma/seed.ts's unexported resolvedSpellEdition default — keep in sync if that changes.
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

    const orphaned = spells.filter((s) => !entryById.has(s.catalogEntryId));
    expect(orphaned.map((s) => s.name)).toEqual([]);

    for (const spell of spells) {
      const entry = entryById.get(spell.catalogEntryId)!;
      expect(entry, `Spell "${spell.name}" (${spell.edition}) has no linked CatalogEntry`).toBeDefined();
      expect(entry.kind, `"${spell.name}" entry.kind`).toBe("SPELL");
      expect(entry.scope, `"${spell.name}" entry.scope`).toBe("GLOBAL");
      expect(entry.ownerUserId, `"${spell.name}" entry.ownerUserId`).toBeNull();
      expect(entry.ownerCampaignId, `"${spell.name}" entry.ownerCampaignId`).toBeNull();
      // Guards against applySpellRenames renaming a Spell without updating its CatalogEntry.
      expect(entry.name, `"${spell.name}" entry.name mismatch`).toBe(spell.name);
      expect(entry.edition, `"${spell.name}" entry.edition mismatch`).toBe(spell.edition);
    }

    expect(new Set(spells.map((s) => s.catalogEntryId)).size).toBe(spells.length);
  });
});
