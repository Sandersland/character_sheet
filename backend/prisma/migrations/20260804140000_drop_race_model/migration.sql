-- #1684 (epic #1518, slice 8/8): prune the flat Race model.
--
-- Delete-not-migrate (owner ruling 2026-08-03, epic review decision 10): the
-- app is unreleased, so any character still on the legacy `raceId` path is
-- DELETED, not remapped onto a Species/SpeciesVariant row. No remap machinery
-- is built anywhere in this epic. Cascades (CharacterRace/CharacterBackground/
-- CharacterClassEntry/InventoryItem/... onDelete: Cascade) remove every
-- dependent row for free.
DELETE FROM "Character"
WHERE "id" IN (
  SELECT "characterId" FROM "CharacterRace" WHERE "raceId" IS NOT NULL
);

-- AlterTable
ALTER TABLE "CharacterRace" DROP CONSTRAINT "CharacterRace_raceId_fkey";
ALTER TABLE "CharacterRace" DROP COLUMN "raceId";

-- DropTable
DROP TABLE "Race";
