-- #1415: widen GrantedAbility's business key from `name` to (name, edition),
-- the two-part shape 20260726111922_catalog_edition_tagging gave Feat and
-- Background. Ahead of #1313, which forks a shadow art / discipline by edition
-- and would otherwise hit a hard P2002.
--
-- NULLS NOT DISTINCT is hand-written because Prisma's DSL cannot express it.
-- Without it Postgres treats NULLs as distinct, so (name, edition) would admit
-- unboundedly many ("Rally", NULL) rows — enforcing nothing for shared content,
-- making resolveEditionRow's shared-row fallback pick a nondeterministic row,
-- and letting upsertEditionRow's findFirst update one twin while leaving a
-- stale other. With the clause each name admits at most three rows: one NULL,
-- one 2014, one 2024 — exactly what resolveEditionRow is written against.
--
-- Cannot abort on populated data, unconditionally and without inspecting any
-- row: the index being dropped guarantees every `name` is already globally
-- distinct, so every (name, edition) pair is distinct too under ANY NULL
-- semantics. Widening a unique index to a superset of its own columns cannot
-- find a duplicate the narrower index admitted. There is no cast, no type
-- change and no value narrowing here, so #1373's enum-swap failure class has
-- no analogue.

-- DropIndex
DROP INDEX "GrantedAbility_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "GrantedAbility_name_edition_key" ON "GrantedAbility"("name", "edition") NULLS NOT DISTINCT;
