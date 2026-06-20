-- CreateEnum
CREATE TYPE "WeaponClass" AS ENUM ('simple', 'martial');

-- CreateEnum
CREATE TYPE "WeaponRange" AS ENUM ('melee', 'ranged');

-- AlterTable
ALTER TABLE "InventoryWeaponDetail" ADD COLUMN     "weaponClass" "WeaponClass",
ADD COLUMN     "weaponRange" "WeaponRange";

-- AlterTable
ALTER TABLE "ItemWeaponDetail" ADD COLUMN     "weaponClass" "WeaponClass",
ADD COLUMN     "weaponRange" "WeaponRange";
