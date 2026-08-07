// In-place catalog spell renames (#1132). SRD 5.2 drops the proper-noun prefixes
// ("Tasha's Hideous Laughter" → "Hideous Laughter"). A name-keyed upsert would
// strand the old row and cascade-delete its SubclassGrantedSpell grants / dangle
// InventoryCapability.spellId provenance, so each rename is an UPDATE that
// preserves the row id. Runs BEFORE seedSpells' upsert loop so the upsert then
// matches the already-renamed row. Idempotent (source-gone = no-op); a target
// collision is logged and skipped rather than crashing the seed.
//
// Scoped to `edition: "EDITION_2024"` (#1710): these are SRD 5.2 renames only
// — the "from" name (e.g. "Tasha's Hideous Laughter") is exactly the PHB'14
// name a future spells-2014/*.ts content slice seeds under its own
// EDITION_2014 row, and `name` is no longer globally unique now that Spell
// carries `edition`. An unscoped lookup would risk renaming that 2014 row
// instead of (or nondeterministically alongside) the intended 2024 one.
//
// Imports only prisma types + the SPELL_RENAMES data, per the seed/migration rule.
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
    await prisma.spell.update({ where: { id: source.id }, data: { name: to } });
    // The linked CatalogEntry (#1796) carries its own `name`, part of its
    // business key — a rename that touched only Spell.name would leave the
    // entry pointing at the pre-rename name forever, silently stale for any
    // later slice (grant/fork UI) that reads the entry's own name.
    await prisma.catalogEntry.update({ where: { id: source.catalogEntryId }, data: { name: to } });
    console.log(`applySpellRenames: renamed "${from}" → "${to}"`);
  }
}
