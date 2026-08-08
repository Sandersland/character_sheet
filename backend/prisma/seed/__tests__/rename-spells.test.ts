// applySpellRenames (#1132): in-place catalog renames that preserve row ids, so
// SubclassGrantedSpell FKs and InventoryCapability.spellId provenance survive the
// 2024 proper-noun drops. Requires DATABASE_URL.
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { makeCatalogEntry } from "@/test-support/catalog-entry.js";
import { applySpellRenames } from "../rename-spells.js";

const CLEANUP = ["Rename Alpha", "Rename Beta", "Rename Gamma"];

// edition: "EDITION_2024" — applySpellRenames is scoped to that edition
// (#1710); an edition-null row here wouldn't be found by the function under
// test. catalogEntryId (#1796) is resolved first — required, no default.
async function makeSpell(name: string) {
  const catalogEntryId = await makeCatalogEntry({ name, edition: "EDITION_2024" });
  return prisma.spell.create({
    data: {
      name, level: 1, school: "evocation", castingTime: "1 action", range: "60 ft",
      duration: "Instantaneous", description: `desc ${name}`,
      edition: "EDITION_2024", catalogEntryId,
    },
  });
}

afterEach(async () => {
  // Deleting the CatalogEntry cascades the Spell row (ON DELETE CASCADE,
  // #1796) — the reverse cascade doesn't exist, so a plain
  // `spell.deleteMany` alone would orphan the entry.
  await prisma.catalogEntry.deleteMany({ where: { name: { in: CLEANUP }, kind: "SPELL" } });
});

describe("applySpellRenames (#1132)", () => {
  it("renames in place, preserving the row id (FK-safe)", async () => {
    const row = await makeSpell("Rename Alpha");
    await applySpellRenames(prisma, [{ from: "Rename Alpha", to: "Rename Beta" }]);
    const renamed = await prisma.spell.findFirst({ where: { name: "Rename Beta" } });
    expect(renamed?.id).toBe(row.id);
    expect(await prisma.spell.findFirst({ where: { name: "Rename Alpha" } })).toBeNull();
  });

  it("is idempotent — a second run (source already gone) is a no-op", async () => {
    const row = await makeSpell("Rename Alpha");
    await applySpellRenames(prisma, [{ from: "Rename Alpha", to: "Rename Beta" }]);
    await applySpellRenames(prisma, [{ from: "Rename Alpha", to: "Rename Beta" }]);
    const renamed = await prisma.spell.findFirst({ where: { name: "Rename Beta" } });
    expect(renamed?.id).toBe(row.id);
  });

  it("skips (does not crash) when the target name already exists", async () => {
    const alpha = await makeSpell("Rename Alpha");
    const beta = await makeSpell("Rename Beta");
    await applySpellRenames(prisma, [{ from: "Rename Alpha", to: "Rename Beta" }]);
    // Both rows survive untouched — collision is logged and skipped.
    expect((await prisma.spell.findUnique({ where: { id: alpha.id } }))?.name).toBe("Rename Alpha");
    expect((await prisma.spell.findUnique({ where: { id: beta.id } }))?.name).toBe("Rename Beta");
  });

  // #1796: the linked CatalogEntry carries its own `name` (part of its
  // business key) — a rename that touched only Spell.name would leave the
  // entry silently stale.
  it("also renames the linked CatalogEntry's name", async () => {
    const row = await makeSpell("Rename Alpha");
    await applySpellRenames(prisma, [{ from: "Rename Alpha", to: "Rename Beta" }]);
    const entry = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: row.catalogEntryId } });
    expect(entry.name).toBe("Rename Beta");
  });
});
