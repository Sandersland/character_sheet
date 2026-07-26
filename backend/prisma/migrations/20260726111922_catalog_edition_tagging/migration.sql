-- #1306: nullable `edition` on the diverging catalogs (Feat, Subclass,
-- GrantedAbility, Action, Background). NULL = "valid in both editions".
--
-- Postgres treats NULLs as distinct in a plain unique index, so a bare
-- CREATE UNIQUE INDEX(name, edition) would let two NULL-edition rows share a
-- name — defeating "shared content is stored once". NULLS NOT DISTINCT
-- (Postgres 15+) is hand-written here because Prisma's schema DSL cannot
-- express it declaratively; only Feat/Subclass/Background get the widened
-- compound constraint (they're the three the epic's decomposition named) —
-- GrantedAbility.name and Action.key stay plain @unique until real divergent
-- content needs them, mirroring how Item/Spell/Pack skip the column entirely.

-- DropIndex
DROP INDEX "Background_name_key";

-- DropIndex
DROP INDEX "Feat_name_key";

-- DropIndex
DROP INDEX "Subclass_classId_name_key";

-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "edition" "RulesEdition";

-- AlterTable
ALTER TABLE "Background" ADD COLUMN     "edition" "RulesEdition";

-- AlterTable
ALTER TABLE "Feat" ADD COLUMN     "edition" "RulesEdition";

-- AlterTable
ALTER TABLE "GrantedAbility" ADD COLUMN     "edition" "RulesEdition";

-- AlterTable
ALTER TABLE "Subclass" ADD COLUMN     "edition" "RulesEdition";

-- CreateIndex
CREATE UNIQUE INDEX "Background_name_edition_key" ON "Background"("name", "edition") NULLS NOT DISTINCT;

-- CreateIndex
CREATE UNIQUE INDEX "Feat_name_edition_key" ON "Feat"("name", "edition") NULLS NOT DISTINCT;

-- CreateIndex
CREATE UNIQUE INDEX "Subclass_classId_name_edition_key" ON "Subclass"("classId", "name", "edition") NULLS NOT DISTINCT;
