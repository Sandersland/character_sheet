/*
  Warnings:

  - You are about to drop the column `grantClass` on the `Action` table. All the data in the column will be lost.
  - You are about to drop the column `grantLevel` on the `Action` table. All the data in the column will be lost.
  - You are about to drop the column `grantSubclass` on the `Action` table. All the data in the column will be lost.
  - You are about to drop the column `resourceKey` on the `Action` table. All the data in the column will be lost.
  - You are about to drop the column `resourceAmount` on the `Action` table. All the data in the column will be lost.

*/
-- grantClass/grantSubclass/grantLevel gated class actions before the #1522 retab moved
-- class/subclass/level gating onto ClassFeature rows (activationCost/resourceKey) and the
-- DERIVED_ACTIONS holdout. resourceKey/resourceAmount are the same story one layer down:
-- deriveActions' resource-pool gate (`enabled`) reads DERIVED_ACTIONS' own TS fields, never
-- this table's columns. No route ever reads any of the five — GET /api/reference's only
-- Action query filters `universal: true` and selects key/name/cost/description/edition
-- (#1979).
-- AlterTable
ALTER TABLE "Action" DROP COLUMN "grantClass",
DROP COLUMN "grantLevel",
DROP COLUMN "grantSubclass",
DROP COLUMN "resourceKey",
DROP COLUMN "resourceAmount";
