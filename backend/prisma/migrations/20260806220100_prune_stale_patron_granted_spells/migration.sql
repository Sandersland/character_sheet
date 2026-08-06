-- #1631: The Archfey's and The Great Old One's PHB'14 "Expanded Spell List"
-- moved entirely off SubclassGrantedSpell onto SubclassSpellListExpansion
-- (list-expansion, not a free grant — see subclass-spell-list-expansions.ts's
-- own header). Both subclasses now author ZERO SubclassGrantedSpell rows, so
-- seedSubclassGrantedSpells' own prune (pruneStaleGrantedSpells,
-- seed-granted-spells.ts) can never reach their old rows: it scopes deletion
-- to the slugs a run actually WROTE a grant onto, and a subclass this run
-- writes nothing for never enters that set — the "unswept twin" class of bug
-- (Folk Hero's own 20260801130000 migration is the precedent for handling
-- this as a migration, not a seed edit). Data-only, no schema change (`prisma
-- migrate diff` would produce nothing for it) — hand-written for the same
-- reason 20260801130000's header records.
--
-- No character-reference guard needed: nothing references SubclassGrantedSpell
-- rows (grants are re-derived from the catalog at read time, never
-- persisted onto a character) — same as pruneStaleGrantedSpells' own comment.
DELETE FROM "SubclassGrantedSpell"
WHERE "subclassId" IN (
  SELECT "Subclass"."id" FROM "Subclass"
  INNER JOIN "CharacterClass" ON "CharacterClass"."id" = "Subclass"."classId"
  WHERE "CharacterClass"."name" = 'Warlock' AND "Subclass"."name" IN ('The Archfey', 'The Great Old One')
);
