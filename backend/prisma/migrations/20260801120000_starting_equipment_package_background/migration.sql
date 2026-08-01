-- #1565: StartingEquipmentPackage grows a second, mutually-exclusive owner —
-- backgroundId alongside the existing classId — so a background's 2024
-- equipment (one choice group, lettered options, per-option GP; #1519/#1533/
-- #1564's shape) can be authored as rows in the SAME family rather than a
-- second Background-prefixed table set. mapStartingEquipmentPackage (backend
-- lib/inventory/starting-equipment-package.ts) needs no change: it already
-- reads groups -> options -> items/openPicks off whatever package row it's
-- handed, regardless of which FK populated it.
--
-- Hand-written because Prisma 7 prompts interactively on `migrate dev
-- --create-only` in this checkout (20260730120000_add_class_feature's header,
-- same reason every other migration since has been hand-written) — not
-- reachable via `prisma migrate dev`.
--
-- classId's existing unique index (StartingEquipmentPackage_classId_edition_key,
-- from 20260731090000_add_starting_equipment) is left untouched: Postgres
-- unique indexes treat NULL as distinct from every other NULL by default (no
-- NULLS NOT DISTINCT was ever added to it), which is exactly what dropping
-- classId's NOT NULL needs — every background row will hold classId NULL,
-- and many NULLs coexisting in that index is the desired shape, not a gap to
-- patch. The new backgroundId_edition index below relies on the same default
-- behaviour for the many classId rows' NULL backgroundId.
--
-- The CHECK constraint (exactly one of classId/backgroundId set) is the
-- enforcement mechanism for "reused family, not a merged one": without it, a
-- row with both FKs null (or both set) would silently defeat
-- startingEquipmentStaleWhere's class/background prune partition (that
-- helper's own comment, and this model's, describe the notIn:[] empty-
-- partition trap a wrong partition would hit).

-- AlterTable
ALTER TABLE "StartingEquipmentPackage" ALTER COLUMN "classId" DROP NOT NULL;
ALTER TABLE "StartingEquipmentPackage" ADD COLUMN "backgroundId" TEXT;

-- AddForeignKey
ALTER TABLE "StartingEquipmentPackage" ADD CONSTRAINT "StartingEquipmentPackage_backgroundId_fkey"
  FOREIGN KEY ("backgroundId") REFERENCES "Background"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "StartingEquipmentPackage_backgroundId_edition_key"
  ON "StartingEquipmentPackage"("backgroundId", "edition");

-- CheckConstraint
ALTER TABLE "StartingEquipmentPackage" ADD CONSTRAINT "StartingEquipmentPackage_class_xor_background_check"
  CHECK (
    ("classId" IS NOT NULL AND "backgroundId" IS NULL)
    OR
    ("classId" IS NULL AND "backgroundId" IS NOT NULL)
  );
