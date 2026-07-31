-- #1564 commit 3: StartingEquipmentPackage's gold-dice columns become
-- nullable. PHB'24 has no roll-for-gold rule at all — NULL states that
-- truthfully; every existing (EDITION_2014) row keeps its current non-null
-- values, so this is a pure constraint relaxation, no data change. Hand-
-- written for consistency with this migration family (Prisma 7 refuses
-- `migrate dev --create-only` here).

-- AlterTable
ALTER TABLE "StartingEquipmentPackage" ALTER COLUMN "goldDiceCount" DROP NOT NULL;
ALTER TABLE "StartingEquipmentPackage" ALTER COLUMN "goldDiceFaces" DROP NOT NULL;
ALTER TABLE "StartingEquipmentPackage" ALTER COLUMN "goldMultiplier" DROP NOT NULL;
