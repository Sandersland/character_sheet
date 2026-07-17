-- Backfill CharacterClassEntry.subclassId from the Subclass catalog for entries
-- that carry a subclass NAME but no id (pre-#898 data, or official subclasses
-- created by name). FK-keyed granted-spell resolution (#898) needs subclassId set.
-- Homebrew subclass names with no catalog match stay null (served via #911).
UPDATE "CharacterClassEntry" e
SET "subclassId" = s."id"
FROM "Subclass" s
WHERE e."subclassId" IS NULL
  AND e."subclass" IS NOT NULL
  AND e."classId" = s."classId"
  AND lower(e."subclass") = lower(s."name");
