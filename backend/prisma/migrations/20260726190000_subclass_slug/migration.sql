-- #1277: stable mechanics-identity slug on Subclass. Added nullable, backfilled
-- deterministically, then made NOT NULL in ONE migration so `migrate deploy`
-- alone leaves the column valid on an EXISTING database. On a FRESH database the
-- table is empty here, so the UPDATE is a no-op and `db seed` writes slugs
-- explicitly — both paths run in CI (test/e2e seed a fresh DB; dev containers
-- migrate an existing one).
--
-- The derivation below is used ONCE, as this backfill plus the authoring
-- convention for new rows. It is the SQL twin of granted-spells.ts's `slug`
-- helper (same [^a-z0-9]+ -> '-' collapse and edge trim). After this migration
-- `slug` is authored data: renaming `name` must leave it alone.
--
-- This is a plain column add + backfill, not an enum-type swap, so
-- scripts/check-enum-narrowing.sh's guard does not apply here.

-- CreateColumn (nullable first, see header)
ALTER TABLE "Subclass" ADD COLUMN     "slug" TEXT;

-- Backfill (idempotent per (class, name); WHERE slug IS NULL makes a re-run a no-op)
UPDATE "Subclass" s
SET "slug" = trim(both '-' from regexp_replace(lower(c."name" || '-' || s."name"), '[^a-z0-9]+', '-', 'g'))
FROM "CharacterClass" c
WHERE c."id" = s."classId"
  AND s."slug" IS NULL;

-- AlterColumn (now safe: every row was backfilled above)
ALTER TABLE "Subclass" ALTER COLUMN "slug" SET NOT NULL;

-- NULLS NOT DISTINCT (Postgres 15+) hand-written because Prisma's DSL cannot
-- express it — same reason 20260726111922_catalog_edition_tagging hand-writes
-- its three indexes. Without it, two shared (edition = NULL) rows could share a
-- slug, defeating "one identity per subclass".
CREATE UNIQUE INDEX "Subclass_slug_edition_key" ON "Subclass"("slug", "edition") NULLS NOT DISTINCT;
