-- #1564 PR #1567 review fix 3: schema.prisma's comment on
-- StartingEquipmentPackage says goldDiceCount/goldDiceFaces/goldMultiplier
-- are "jointly null, never partially" (PHB'24 has no roll-for-gold rule at
-- all; every EDITION_2014 package keeps all three set) — mapGold's two
-- non-null assertions (backend lib/inventory/starting-equipment-package.ts)
-- rest entirely on that convention today. This CHECK constraint makes a
-- partially-null row impossible to write at all, rather than trusting every
-- future write path to honour a comment. A NEW migration, not an edit to the
-- already-applied 20260731140000 migration that made the columns nullable —
-- editing an applied migration's file changes its checksum, which is the
-- exact "modified after it was applied" breakage already blocking
-- `prisma migrate dev`/`--create-only` in this checkout; this file only adds
-- to what that migration left in place.

-- AlterTable
ALTER TABLE "StartingEquipmentPackage" ADD CONSTRAINT "StartingEquipmentPackage_gold_dice_jointly_null_check"
  CHECK (
    ("goldDiceCount" IS NULL AND "goldDiceFaces" IS NULL AND "goldMultiplier" IS NULL)
    OR
    ("goldDiceCount" IS NOT NULL AND "goldDiceFaces" IS NOT NULL AND "goldMultiplier" IS NOT NULL)
  );
