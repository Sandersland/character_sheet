// applySpellRenames (#1132): in-place catalog renames that preserve row ids, so
// SubclassGrantedSpell FKs and InventoryCapability.spellId provenance survive the
// 2024 proper-noun drops. Requires DATABASE_URL.
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { applySpellRenames } from "../rename-spells.js";

const CLEANUP = ["Rename Alpha", "Rename Beta", "Rename Gamma"];

async function makeSpell(name: string) {
  return prisma.spell.create({
    data: {
      name, level: 1, school: "evocation", castingTime: "1 action", range: "60 ft",
      duration: "Instantaneous", description: `desc ${name}`, classes: ["wizard"],
    },
  });
}

afterEach(async () => {
  await prisma.spell.deleteMany({ where: { name: { in: CLEANUP } } });
});

describe("applySpellRenames (#1132)", () => {
  it("renames in place, preserving the row id (FK-safe)", async () => {
    const row = await makeSpell("Rename Alpha");
    await applySpellRenames(prisma, [{ from: "Rename Alpha", to: "Rename Beta" }]);
    const renamed = await prisma.spell.findUnique({ where: { name: "Rename Beta" } });
    expect(renamed?.id).toBe(row.id);
    expect(await prisma.spell.findUnique({ where: { name: "Rename Alpha" } })).toBeNull();
  });

  it("is idempotent — a second run (source already gone) is a no-op", async () => {
    const row = await makeSpell("Rename Alpha");
    await applySpellRenames(prisma, [{ from: "Rename Alpha", to: "Rename Beta" }]);
    await applySpellRenames(prisma, [{ from: "Rename Alpha", to: "Rename Beta" }]);
    const renamed = await prisma.spell.findUnique({ where: { name: "Rename Beta" } });
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
});
