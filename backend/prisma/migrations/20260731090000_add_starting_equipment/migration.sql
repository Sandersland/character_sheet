-- #1519/#1533: StartingEquipmentPackage/Group/Option/Item/OpenPick — a seeded
-- home for the per-class starting-equipment packages that lived in
-- backend/src/lib/inventory/starting-equipment.ts's STARTING_EQUIPMENT
-- (twelve Record<string, ClassStartingEquipment> literals). Hand-written
-- because Prisma 7 prompts interactively on `migrate dev --create-only` (see
-- 20260730120000_add_class_feature's header, same reason).
--
-- This migration is a pure CREATE TABLE set (five new tables, six FKs) plus
-- unique/index constraints on brand-new tables — no cast, no narrowing, no
-- backfill, no USING — so it has no populated-data failure mode;
-- scripts/check-enum-narrowing.sh's guard does not apply here (no replacement
-- enum type is created and no enum value is relabeled; WeaponClass/
-- WeaponRange are reused unchanged from their existing definitions). Applied
-- in this repo against a database that already holds twelve seeded
-- CharacterClass rows, so StartingEquipmentPackage_classId_fkey is genuinely
-- exercised by the FK creation rather than running against an empty schema.
--
-- StartingEquipmentPackage.edition is NON-NULLABLE (unlike ClassFeature's
-- nullable subclassId), so @@unique([classId, edition]) needs no NULLS NOT
-- DISTINCT clause — there is no NULL-edition row that could collide.

-- CreateTable
CREATE TABLE "StartingEquipmentPackage" (
    "id"             TEXT NOT NULL,
    "classId"        TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "edition"        "RulesEdition" NOT NULL,
    "goldDiceCount"  INTEGER NOT NULL,
    "goldDiceFaces"  INTEGER NOT NULL,
    "goldMultiplier" INTEGER NOT NULL,

    CONSTRAINT "StartingEquipmentPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StartingEquipmentGroup" (
    "id"        TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "position"  INTEGER NOT NULL,
    "label"     TEXT NOT NULL,

    CONSTRAINT "StartingEquipmentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StartingEquipmentOption" (
    "id"       TEXT NOT NULL,
    "groupId"  TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label"    TEXT NOT NULL,

    CONSTRAINT "StartingEquipmentOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StartingEquipmentItem" (
    "id"          TEXT NOT NULL,
    "optionId"    TEXT NOT NULL,
    "position"    INTEGER NOT NULL,
    "catalogName" TEXT NOT NULL,
    "quantity"    INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "StartingEquipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StartingEquipmentOpenPick" (
    "id"          TEXT NOT NULL,
    "optionId"    TEXT NOT NULL,
    "position"    INTEGER NOT NULL,
    "label"       TEXT NOT NULL,
    "weaponClass" "WeaponClass",
    "weaponRange" "WeaponRange",
    "quantity"    INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "StartingEquipmentOpenPick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StartingEquipmentPackage_classId_edition_key"
  ON "StartingEquipmentPackage"("classId", "edition");

-- CreateIndex
CREATE UNIQUE INDEX "StartingEquipmentGroup_packageId_position_key"
  ON "StartingEquipmentGroup"("packageId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "StartingEquipmentOption_groupId_position_key"
  ON "StartingEquipmentOption"("groupId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "StartingEquipmentItem_optionId_position_key"
  ON "StartingEquipmentItem"("optionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "StartingEquipmentOpenPick_optionId_position_key"
  ON "StartingEquipmentOpenPick"("optionId", "position");

-- AddForeignKey
ALTER TABLE "StartingEquipmentPackage" ADD CONSTRAINT "StartingEquipmentPackage_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "CharacterClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StartingEquipmentGroup" ADD CONSTRAINT "StartingEquipmentGroup_packageId_fkey"
  FOREIGN KEY ("packageId") REFERENCES "StartingEquipmentPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StartingEquipmentOption" ADD CONSTRAINT "StartingEquipmentOption_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "StartingEquipmentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StartingEquipmentItem" ADD CONSTRAINT "StartingEquipmentItem_optionId_fkey"
  FOREIGN KEY ("optionId") REFERENCES "StartingEquipmentOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StartingEquipmentOpenPick" ADD CONSTRAINT "StartingEquipmentOpenPick_optionId_fkey"
  FOREIGN KEY ("optionId") REFERENCES "StartingEquipmentOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
