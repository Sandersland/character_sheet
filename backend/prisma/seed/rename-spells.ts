// In-place catalog spell renames (#1132). SRD 5.2 drops the proper-noun prefixes
// ("Tasha's Hideous Laughter" → "Hideous Laughter"). A name-keyed upsert would
// strand the old row and cascade-delete its SubclassGrantedSpell grants / dangle
// InventoryCapability.spellId provenance, so each rename is an UPDATE that
// preserves the row id. Runs BEFORE seedSpells' upsert loop so the upsert then
// matches the already-renamed row. Idempotent (source-gone = no-op); a target
// collision is logged and skipped rather than crashing the seed.
//
// Imports only prisma types + the SPELL_RENAMES data, per the seed/migration rule.
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { SpellRename } from "./spells.js";

export async function applySpellRenames(prisma: PrismaClient, renames: SpellRename[]): Promise<void> {
  for (const { from, to } of renames) {
    const source = await prisma.spell.findUnique({ where: { name: from }, select: { id: true } });
    if (!source) continue; // already renamed or never existed — idempotent
    const target = await prisma.spell.findUnique({ where: { name: to }, select: { id: true } });
    if (target) {
      console.log(`applySpellRenames: "${to}" already exists — skipping rename of "${from}"`);
      continue;
    }
    await prisma.spell.update({ where: { id: source.id }, data: { name: to } });
    console.log(`applySpellRenames: renamed "${from}" → "${to}"`);
  }
}
