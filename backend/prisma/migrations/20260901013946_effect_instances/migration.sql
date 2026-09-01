-- (#1571) The Spell_catalogEntryId_fkey DropForeignKey `prisma migrate dev`
-- generated here is stripped on purpose, same as
-- 20260815014400_fix_catalog_entry_index_name, 20260819024318_add_inbox_dismissal,
-- 20260824034635_add_resource_recharge_tiers, 20260827031745_add_resource_detail_tiers,
-- 20260828134438_add_resource_on_initiative and 20260828144053_add_classfeature_choice_columns:
-- that FK is hand-written onto a deliberately relationless scalar (Spell.catalogEntryId has no
-- Prisma @relation), so every diff proposes dropping it — applying that would destroy real integrity.

-- CreateEnum
CREATE TYPE "EffectInstanceRoll" AS ENUM ('each', 'once');

-- AlterTable
ALTER TABLE "ClassFeature" ADD COLUMN     "instanceCount" INTEGER,
ADD COLUMN     "instanceRoll" "EffectInstanceRoll",
ADD COLUMN     "upcastInstancesPerLevel" INTEGER;

-- AlterTable
ALTER TABLE "Spell" ADD COLUMN     "instanceCount" INTEGER,
ADD COLUMN     "instanceRoll" "EffectInstanceRoll",
ADD COLUMN     "upcastInstancesPerLevel" INTEGER;
