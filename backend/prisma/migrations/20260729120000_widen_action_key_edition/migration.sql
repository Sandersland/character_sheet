-- #1430: widen Action's business key from `key` to (key, edition), the two-part
-- shape 20260726111922_catalog_edition_tagging gave Feat and Background and
-- 20260728120000_widen_granted_ability_name_edition gave GrantedAbility. Ahead
-- of the seed fork in the same PR, which writes every universal action twice
-- (once per edition) and would otherwise hit a hard P2002.
--
-- NULLS NOT DISTINCT is hand-written because Prisma's DSL cannot express it.
-- Without it Postgres treats NULLs as distinct, so (key, edition) would admit
-- unboundedly many ("rage", NULL) rows — enforcing nothing for the class rows,
-- which all stay edition-NULL, making resolveEditionRow's shared-row fallback
-- pick a nondeterministic row, and letting upsertEditionRow's findFirst update
-- one twin while leaving a stale other. With the clause each key admits at most
-- three rows: one NULL, one 2014, one 2024 — exactly what resolveEditionRow is
-- written against.
--
-- Cannot abort on populated data, unconditionally and without inspecting any
-- row: the index being dropped guarantees every `key` is already globally
-- distinct, so every (key, edition) pair is distinct too under ANY NULL
-- semantics. Widening a unique index to a superset of its own columns cannot
-- find a duplicate the narrower index admitted. There is no cast, no type
-- change and no value narrowing here, so #1373's enum-swap failure class has
-- no analogue.

-- DropIndex
DROP INDEX "Action_key_key";

-- CreateIndex
CREATE UNIQUE INDEX "Action_key_edition_key" ON "Action"("key", "edition") NULLS NOT DISTINCT;
