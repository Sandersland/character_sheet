// UPDATE, not a name-keyed upsert (#1132): SRD 5.2 drops proper-noun prefixes (e.g. "Tasha's Hideous Laughter" -> "Hideous Laughter"), and a name-keyed upsert would strand the old row, cascade-deleting its SubclassGrantedSpell grants and dangling InventoryCapability.spellId provenance. Must run before seedSpells' upsert loop so it matches the already-renamed row. Idempotent; a target-name collision is logged and skipped rather than crashing the seed.
// Scoped to EDITION_2024 (#1710): `name` is no longer globally unique now that Spell carries `edition`, and the "from" name is exactly the PHB'14 name a 2014 row could carry — an unscoped lookup risks renaming that row instead.
// Takes renames as a parameter rather than importing SPELL_RENAMES directly, per the seed/migration import rule.
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { SpellRename } from "./spells.js";

const RENAME_EDITION = "EDITION_2024" as const;

export async function applySpellRenames(prisma: PrismaClient, renames: SpellRename[]): Promise<void> {
  for (const { from, to } of renames) {
    const source = await prisma.spell.findFirst({
      where: { name: from, edition: RENAME_EDITION },
      select: { id: true, catalogEntryId: true },
    });
    if (!source) continue; // already renamed or never existed — idempotent
    const target = await prisma.spell.findFirst({ where: { name: to, edition: RENAME_EDITION }, select: { id: true } });
    if (target) {
      console.log(`applySpellRenames: "${to}" already exists — skipping rename of "${from}"`);
      continue;
    }
    // The linked CatalogEntry (#1796) carries its own `name`, part of its business key, so the Spell rename and the entry rename must commit together — a crash between two separate writes would leave the entry pointing at the pre-rename name forever.
    await prisma.$transaction(async (tx) => {
      await tx.spell.update({ where: { id: source.id }, data: { name: to } });
      await tx.catalogEntry.update({ where: { id: source.catalogEntryId }, data: { name: to } });
    });
    console.log(`applySpellRenames: renamed "${from}" → "${to}"`);
  }
}
