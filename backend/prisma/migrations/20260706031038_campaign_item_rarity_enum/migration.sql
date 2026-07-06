-- CreateEnum
CREATE TYPE "ItemRarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'VERY_RARE', 'LEGENDARY', 'ARTIFACT');

-- AlterTable: convert free-text rarity to the enum, backfilling case-insensitively.
-- Known values map to their tier; blank/unrecognized text becomes NULL (mundane).
ALTER TABLE "CampaignItem"
  ALTER COLUMN "rarity" TYPE "ItemRarity"
  USING (
    CASE lower(trim("rarity"))
      WHEN 'common' THEN 'COMMON'::"ItemRarity"
      WHEN 'uncommon' THEN 'UNCOMMON'::"ItemRarity"
      WHEN 'rare' THEN 'RARE'::"ItemRarity"
      WHEN 'very rare' THEN 'VERY_RARE'::"ItemRarity"
      WHEN 'very_rare' THEN 'VERY_RARE'::"ItemRarity"
      WHEN 'legendary' THEN 'LEGENDARY'::"ItemRarity"
      WHEN 'artifact' THEN 'ARTIFACT'::"ItemRarity"
      ELSE NULL
    END
  );
