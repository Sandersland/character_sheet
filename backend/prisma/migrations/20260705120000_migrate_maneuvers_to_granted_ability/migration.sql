-- Battle Master maneuvers move onto the declarative GrantedAbility core (#418).
-- Steps: new enum value + catalog columns → seed maneuver rows from the retiring
-- Maneuver table (descriptions preserved) → repoint known-maneuver JSON entries
-- by name-match → drop the Maneuver table.

-- AlterEnum
ALTER TYPE "CharacterEventType" ADD VALUE 'castManeuver';

-- AlterTable
ALTER TABLE "GrantedAbility" ADD COLUMN     "actionSlot" TEXT,
ADD COLUMN     "placement" TEXT,
ADD COLUMN     "selfTempHp" BOOLEAN NOT NULL DEFAULT false;

-- Seed maneuver catalog rows as GrantedAbility (source "maneuver"), preserving
-- the old descriptions. Every maneuver costs 1 superiority die and rolls it.
INSERT INTO "GrantedAbility"
  (id, name, source, description, "minLevel", "alwaysKnown", "costKind", "costPoolKey", "costBase", "effectDieSource", "selfTempHp")
SELECT gen_random_uuid(), name, 'maneuver', description, 3, false, 'pool', 'superiorityDice', 1, 'superiorityDice', false
FROM "Maneuver"
ON CONFLICT (name) DO NOTHING;

-- Placement / action-slot / save-ability metadata.
UPDATE "GrantedAbility" SET placement = 'attackOption', "actionSlot" = 'bonusAction' WHERE source = 'maneuver' AND name = 'Commander''s Strike';
UPDATE "GrantedAbility" SET placement = 'attackRoll' WHERE source = 'maneuver' AND name = 'Precision Attack';
UPDATE "GrantedAbility" SET placement = 'reaction', "actionSlot" = 'reaction' WHERE source = 'maneuver' AND name IN ('Parry', 'Riposte');
UPDATE "GrantedAbility" SET placement = 'effect' WHERE source = 'maneuver' AND name = 'Evasive Footwork';
UPDATE "GrantedAbility" SET placement = 'effect', "actionSlot" = 'bonusAction', "selfTempHp" = true WHERE source = 'maneuver' AND name = 'Rally';
UPDATE "GrantedAbility" SET placement = 'damageRoll', "actionSlot" = 'bonusAction' WHERE source = 'maneuver' AND name = 'Feinting Attack';
UPDATE "GrantedAbility" SET placement = 'damageRoll' WHERE source = 'maneuver' AND placement IS NULL;
UPDATE "GrantedAbility" SET "saveAbility" = 'strength' WHERE source = 'maneuver' AND name IN ('Trip Attack', 'Disarming Attack', 'Pushing Attack');
UPDATE "GrantedAbility" SET "saveAbility" = 'wisdom' WHERE source = 'maneuver' AND name IN ('Menacing Attack', 'Goading Attack');

-- Repoint each character's known-maneuver entries: name-match old maneuverId to
-- the new GrantedAbility row, snapshotting placement/actionSlot. Custom entries
-- (no catalog match) are left untouched.
UPDATE "Character" c
SET resources = jsonb_set(
  c.resources,
  '{maneuversKnown}',
  (
    SELECT COALESCE(jsonb_agg(
      CASE WHEN ga.id IS NOT NULL
        THEN t.elem
             || jsonb_build_object('maneuverId', ga.id)
             || jsonb_build_object('placement', to_jsonb(ga.placement))
             || jsonb_build_object('actionSlot', to_jsonb(ga."actionSlot"))
        ELSE t.elem
      END
      ORDER BY t.ord
    ), '[]'::jsonb)
    FROM jsonb_array_elements(c.resources->'maneuversKnown') WITH ORDINALITY AS t(elem, ord)
    LEFT JOIN "GrantedAbility" ga
      ON ga.source = 'maneuver' AND ga.name = (t.elem->>'name')
  )
)
WHERE c.resources IS NOT NULL
  AND jsonb_typeof(c.resources->'maneuversKnown') = 'array'
  AND jsonb_array_length(c.resources->'maneuversKnown') > 0;

-- DropTable
DROP TABLE "Maneuver";
