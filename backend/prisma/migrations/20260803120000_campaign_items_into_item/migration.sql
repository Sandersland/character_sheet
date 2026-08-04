-- #1646 (epic #1644): move every CampaignItem row into Item. #1645 gave Item
-- the scope discriminator and the rarity/attunement/capability columns; this is
-- the row move that makes the CampaignItem family redundant. 20260803130000
-- drops it — this migration is purely additive so the two can be verified, and
-- if necessary reverted, independently.
--
-- IDS ARE PRESERVED. That is what makes the InventoryItem repoint below a
-- straight UPDATE rather than a join through a mapping table, and it is also
-- what lets historical audit blobs — which store the old campaignItemId and are
-- append-only, so they are never rewritten — still resolve afterwards.
--
-- Hand-written per the convention 20260801120000's header records: Prisma 7
-- prompts interactively on `migrate dev --create-only` in this checkout.

-- Guard: the repoint below overwrites InventoryItem.itemId from campaignItemId,
-- which is only lossless because the award path writes campaignItemId and
-- leaves itemId null. If that has ever not held, stop rather than silently
-- discard a catalog provenance FK.
DO $$
DECLARE conflicting INT;
BEGIN
  SELECT count(*) INTO conflicting
  FROM "InventoryItem"
  WHERE "campaignItemId" IS NOT NULL AND "itemId" IS NOT NULL;

  IF conflicting > 0 THEN
    RAISE EXCEPTION
      'Cannot merge: % InventoryItem row(s) carry BOTH itemId and campaignItemId; repointing would discard the catalog reference.',
      conflicting;
  END IF;
END $$;

INSERT INTO "Item" (
  "id", "scope", "scopeKey", "campaignId", "name", "category", "weight", "cost",
  "description", "slot", "rarity", "requiresAttunement", "attunementPrereqKind",
  "attunementPrereqValue", "isUnique", "dmNotes", "createdAt", "updatedAt"
)
SELECT
  ci."id", 'CAMPAIGN', 'campaign:' || ci."campaignId", ci."campaignId", ci."name",
  ci."category", ci."weight", ci."cost", ci."description", ci."slot", ci."rarity",
  ci."requiresAttunement", ci."attunementPrereqKind", ci."attunementPrereqValue",
  ci."isUnique", ci."dmNotes", ci."createdAt", ci."updatedAt"
FROM "CampaignItem" ci;

-- Detail tables: same column sets by construction (each CampaignItem*Detail was
-- created as "same shape as Item*Detail"), so these are straight copies keyed on
-- the preserved id. New detail-row ids are fine — nothing references them.
INSERT INTO "ItemWeaponDetail" (
  "id", "itemId", "damageDiceCount", "damageDiceFaces", "damageModifier", "damageType",
  "versatileDiceCount", "versatileDiceFaces", "finesse", "light", "heavy", "twoHanded",
  "reach", "thrown", "ammunition", "rangeNormal", "rangeLong", "weaponClass", "weaponRange"
)
SELECT
  gen_random_uuid()::text, d."campaignItemId", d."damageDiceCount", d."damageDiceFaces",
  d."damageModifier", d."damageType", d."versatileDiceCount", d."versatileDiceFaces",
  d."finesse", d."light", d."heavy", d."twoHanded", d."reach", d."thrown", d."ammunition",
  d."rangeNormal", d."rangeLong", d."weaponClass", d."weaponRange"
FROM "CampaignItemWeaponDetail" d;

INSERT INTO "ItemArmorDetail" (
  "id", "itemId", "armorCategory", "baseArmorClass", "dexModifierApplies",
  "dexModifierMax", "stealthDisadvantage", "strengthRequirement"
)
SELECT
  gen_random_uuid()::text, d."campaignItemId", d."armorCategory", d."baseArmorClass",
  d."dexModifierApplies", d."dexModifierMax", d."stealthDisadvantage", d."strengthRequirement"
FROM "CampaignItemArmorDetail" d;

-- usesRemaining is deliberately NOT copied. Both DEFINITION tables carry the
-- column, but it is vestigial there: consumableInputSchema does not accept it,
-- nothing outside the InventoryConsumableDetail rest/activity paths ever writes
-- it, and every live definition row has it null. Copying it would propagate a
-- runtime counter onto authored content — the exact frozen/mutable confusion
-- #1647's snapshot schema exists to make unrepresentable.
INSERT INTO "ItemConsumableDetail" (
  "id", "itemId", "effectDiceCount", "effectDiceFaces", "effectModifier", "effectDescription", "maxUses"
)
SELECT
  gen_random_uuid()::text, d."campaignItemId", d."effectDiceCount", d."effectDiceFaces",
  d."effectModifier", d."effectDescription", d."maxUses"
FROM "CampaignItemConsumableDetail" d;

-- Verify that assumption rather than trusting it: if any source row DOES carry
-- a value, the copy above is lossy and this migration should be reconsidered.
DO $$
DECLARE stray INT;
BEGIN
  SELECT count(*) INTO stray FROM "CampaignItemConsumableDetail" WHERE "usesRemaining" IS NOT NULL;
  IF stray > 0 THEN
    RAISE EXCEPTION 'Cannot merge: % CampaignItemConsumableDetail row(s) carry usesRemaining, which definition rows are not supposed to hold.', stray;
  END IF;
END $$;

-- ItemCapability's column set was copied verbatim from CampaignItemCapability in
-- #1645 and guarded by a parity test, which is what lets this be an explicit
-- column list rather than a hopeful SELECT *.
INSERT INTO "ItemCapability" (
  "id", "itemId", "kind", "description", "target", "op", "value", "targetKey", "condition",
  "valueDiceCount", "valueDiceFaces", "valueDamageType", "activatedDuration", "activation",
  "durationText", "resourceCharges", "resourceKind", "resourcePeriod", "attackMode",
  "attackValue", "castConcentration", "castLevel", "castResource", "castUses", "dcMode",
  "dcValue", "spellId", "spellLevel", "spellName", "cantBeSurprised", "grantOn", "grantType",
  "grantValue", "grantValueKind", "chargeCost", "maxCharges", "rechargeBonus",
  "rechargeDiceCount", "rechargeDiceFaces", "rechargeTrigger"
)
SELECT
  c."id", c."campaignItemId", c."kind", c."description", c."target", c."op", c."value",
  c."targetKey", c."condition", c."valueDiceCount", c."valueDiceFaces", c."valueDamageType",
  c."activatedDuration", c."activation", c."durationText", c."resourceCharges", c."resourceKind",
  c."resourcePeriod", c."attackMode", c."attackValue", c."castConcentration", c."castLevel",
  c."castResource", c."castUses", c."dcMode", c."dcValue", c."spellId", c."spellLevel",
  c."spellName", c."cantBeSurprised", c."grantOn", c."grantType", c."grantValue",
  c."grantValueKind", c."chargeCost", c."maxCharges", c."rechargeBonus", c."rechargeDiceCount",
  c."rechargeDiceFaces", c."rechargeTrigger"
FROM "CampaignItemCapability" c;

-- Provenance: awarded rows carried campaignItemId and a null itemId. The ids are
-- unchanged, so this is a rename in place.
UPDATE "InventoryItem" SET "itemId" = "campaignItemId" WHERE "campaignItemId" IS NOT NULL;

-- CampaignItemLink is deliberately NOT repointed here. It still fronts
-- CampaignItem (unchanged, unmigrated by this file) because the code that
-- WRITES it — the create route's nested `link: { create }` — still targets
-- CampaignItem until Task 2 retargets item creation onto Item itself; a new
-- CampaignItem row has no Item counterpart to point at until then. Repointing
-- the FK here would leave POST /campaigns/:id/items unable to satisfy it (no
-- matching Item row exists for a freshly created CampaignItem), breaking item
-- creation for the span between this migration and Task 2's. The repoint
-- migrates alongside the code that depends on it: see
-- 20260803125000_campaign_item_link_to_item, landed with Task 2.
