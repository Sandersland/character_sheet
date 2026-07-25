-- Stamping decision for existing rows: EDITION_2024. Settled by the cutover
-- audit on #1281 (2026-07-25), recorded here because the DEFAULT below *is* the
-- backfill and the reasoning is not otherwise recoverable.
--
-- The shipped content is uniformly 2024. All twelve classes carry
-- subclassLevel: 3 in the class catalog; no subclass definition sets grantLevel,
-- so isSubclassActive's `?? 3` resolves to 3 everywhere; the Feat catalog is the
-- SRD 5.2.1 reseed; conditions and exhaustion are SRD 5.2. Stamping existing
-- rows EDITION_2014 would point them at rules for which no content exists in the
-- database, producing a strictly worse sheet than they render today. The two
-- reversible cutover scripts (migrate-known-casters-prepared-2024,
-- migrate-fighting-styles-feats-2024) also moved character state toward 2024 and
-- are undoable per-character.
--
-- Known limitation, deliberately accepted: a genuinely 2014-authored sheet is
-- indistinguishable from a 2024 one after the fact (exhaustion #1136 is the
-- clearest case — the stored level's meaning changed with no row rewrite).
-- Re-authoring those is a per-character problem no DEFAULT clause can solve.

-- CreateEnum
CREATE TYPE "RulesEdition" AS ENUM ('EDITION_2014', 'EDITION_2024');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "rulesEdition" "RulesEdition" NOT NULL DEFAULT 'EDITION_2024';

-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "rulesEdition" "RulesEdition" NOT NULL DEFAULT 'EDITION_2024';
