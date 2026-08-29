-- (#1571) The Spell_catalogEntryId_fkey DropForeignKey `prisma migrate dev`
-- generated here is stripped on purpose, same as
-- 20260815014400_fix_catalog_entry_index_name, 20260819024318_add_inbox_dismissal,
-- 20260824034635_add_resource_recharge_tiers and 20260827031745_add_resource_detail_tiers:
-- that FK is hand-written onto a deliberately relationless scalar
-- (Spell.catalogEntryId has no Prisma @relation), so every diff proposes
-- dropping it — applying that would destroy real integrity.

-- AlterTable
ALTER TABLE "ClassFeature" ADD COLUMN     "resourceOnInitiative" JSONB;
