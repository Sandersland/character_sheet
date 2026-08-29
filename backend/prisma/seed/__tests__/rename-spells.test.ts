// applySpellRenames preserves row ids so SubclassGrantedSpell FKs and InventoryCapability.spellId survive renames (#1132).
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { makeCatalogEntry } from "@/test-support/catalog-entry.js";
import { applySpellRenames } from "../rename-spells.js";

const CLEANUP = ["Rename Alpha", "Rename Beta", "Rename Gamma"];

// applySpellRenames only touches EDITION_2024 rows (#1710).
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
  // CatalogEntry deletion cascades to Spell, but not the reverse (#1796).
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
    expect((await prisma.spell.findUnique({ where: { id: alpha.id } }))?.name).toBe("Rename Alpha");
    expect((await prisma.spell.findUnique({ where: { id: beta.id } }))?.name).toBe("Rename Beta");
  });

  // CatalogEntry carries its own `name`; renaming Spell.name alone would leave it stale (#1796).
  it("also renames the linked CatalogEntry's name", async () => {
    const row = await makeSpell("Rename Alpha");
    await applySpellRenames(prisma, [{ from: "Rename Alpha", to: "Rename Beta" }]);
    const entry = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: row.catalogEntryId } });
    expect(entry.name).toBe("Rename Beta");
  });
});
