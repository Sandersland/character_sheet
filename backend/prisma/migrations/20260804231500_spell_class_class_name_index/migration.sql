-- #1712 (folded in from #1711's review): `SpellClass`'s only existing index
-- is the UNIQUE (spellId, className) composite from #1711's migration —
-- className is not the LEADING column there, so a `?class=` lookup
-- (`classMemberships: { some: { className } }`, spells.ts) can't use it and
-- falls back to a sequential scan. Harmless at today's ~600 membership rows;
-- the 2014 content slices (#1713-#1721) are about to multiply that row
-- count, so the index earns its keep before they land rather than after.
--
-- Hand-written, not `prisma migrate dev`-generated: a pure additive index
-- needs no destructive-DDL workaround, but this repo's migrations for this
-- table are already hand-written (#1711's join migration) and Prisma 7.8's
-- `migrate dev` would otherwise want to regenerate the whole diff against
-- the drifted (already-hand-migrated) shadow database.

-- CreateIndex
CREATE INDEX "SpellClass_className_idx" ON "SpellClass"("className");
