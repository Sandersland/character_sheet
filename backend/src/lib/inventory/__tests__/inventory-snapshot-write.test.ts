// buildInventorySnapshot (#1648, epic #1644) — the one construction function
// every creation path calls. Assembled first against a hand-built row so the
// mapping is verified in isolation before the write-path describe blocks below
// exercise the real creation/mutation call sites.
//
// #1649 retired this file's original premise: #1648 dual-wrote the snapshot
// alongside the four Inventory* mirror tables so both could be verified
// side by side; #1649 deletes those tables; every write below is now the
// SOLE write, verified against the snapshot + InventoryCapabilityUse /
// InventoryItem.usesRemaining alone.
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { inventorySnapshotSchema } from "@character-sheet/contracts";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { makeCatalogEntry } from "@/test-support/catalog-entry.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";
import { applyInventoryOperations, revertInventoryEvent } from "@/lib/inventory/inventory.js";
import { awardCampaignItem, revokeCampaignItem } from "@/lib/campaign/campaign-item-award.js";
import { createCharacter } from "@/lib/character/character-create.js";
import { applyHitPointOperations } from "@/lib/combat/hitpoints.js";
import { applySpellcastingOperations } from "@/lib/spellcasting/spellcasting.js";
import { revertBatch } from "@/lib/activity/activity.js";
import { inventoryItemFixtureData } from "@/test-support/inventory-snapshot-fixture.js";
import { seededSpeciesId } from "@/test-support/species.js";
import { buildInventorySnapshot, type SnapshotSourceRow } from "../inventory-snapshot-build.js";

const ROW_WITH_EVERYTHING: SnapshotSourceRow = {
  name: "Flame Tongue",
  category: "weapon",
  weight: 3,
  cost: { cp: 0, sp: 0, gp: 5000, pp: 0 },
  description: "A blade that ignites on command.",
  slot: "MAIN_HAND",
  rarity: "RARE",
  requiresAttunement: true,
  attunementPrereqKind: "class",
  attunementPrereqValue: "Fighter",
  weaponDetail: {
    damageDiceCount: 2,
    damageDiceFaces: 6,
    damageModifier: 0,
    damageType: "slashing",
    versatileDiceCount: null,
    versatileDiceFaces: null,
    finesse: false,
    light: false,
    heavy: false,
    twoHanded: false,
    reach: false,
    thrown: false,
    ammunition: false,
    rangeNormal: null,
    rangeLong: null,
    weaponClass: "martial",
    weaponRange: "melee",
  },
  armorDetail: {
    armorCategory: "shield",
    baseArmorClass: 2,
    dexModifierApplies: false,
    dexModifierMax: null,
    stealthDisadvantage: false,
    strengthRequirement: null,
  },
  consumableDetail: {
    effectDiceCount: 2,
    effectDiceFaces: 4,
    effectModifier: 0,
    effectDescription: "Heals",
    maxUses: 3,
    usesRemaining: 3,
  },
  capabilities: [
    {
      id: "cap-1",
      kind: "passiveBonus",
      target: "ac",
      op: "add",
      value: 1,
      targetKey: null,
      condition: null,
      description: null,
      valueDiceCount: null,
      valueDiceFaces: null,
      valueDamageType: null,
    },
    {
      id: "cap-2",
      kind: "grant",
      grantType: "resistance",
      grantValueKind: "damageType",
      grantValue: "fire",
      cantBeSurprised: false,
      description: null,
    },
  ],
};

const ROW_WITH_NAMELESS_CAST_SPELL: SnapshotSourceRow = {
  ...ROW_WITH_EVERYTHING,
  capabilities: [
    {
      id: "cap-3",
      kind: "castSpell",
      spellId: "spell-1",
      spellName: null,
      spellLevel: 3,
      castLevel: 3,
      castResource: "perDayDawn",
      castUses: 1,
      castConcentration: false,
      dcMode: "fixed",
      dcValue: 15,
      attackMode: "fixed",
      attackValue: null,
      chargeCost: null,
      description: null,
    },
  ],
};

describe("buildInventorySnapshot (#1648)", () => {
  it("builds a snapshot that parses, from a fully-populated row", () => {
    const snap = buildInventorySnapshot(ROW_WITH_EVERYTHING);
    const result = inventorySnapshotSchema.safeParse(snap);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it("omits every mutable field", () => {
    const snap = buildInventorySnapshot(ROW_WITH_EVERYTHING) as unknown as Record<string, unknown>;
    for (const k of ["quantity", "equippedSlot", "attuned", "notes", "position", "activatedUsesSpent", "usesRemaining"]) {
      expect(snap).not.toHaveProperty(k);
    }
    expect(snap.consumable).not.toHaveProperty("usesRemaining");
    for (const cap of snap.capabilities as Record<string, unknown>[]) {
      expect(cap).not.toHaveProperty("used");
    }
  });

  // readCastSpellRow defaults a null spellName to "", which the schema rejects
  // (min(1)). Zero rows hit this today — there are no castSpell rows at all —
  // but the builder must not be the thing that discovers it.
  it("throws rather than emitting an unparseable castSpell entry", () => {
    expect(() => buildInventorySnapshot(ROW_WITH_NAMELESS_CAST_SPELL)).toThrow(/spellName/);
  });

  it("keys each capability by its row id", () => {
    const snap = buildInventorySnapshot(ROW_WITH_EVERYTHING);
    expect(snap.capabilities.map((c) => c.key)).toEqual(ROW_WITH_EVERYTHING.capabilities.map((c) => c.id));
  });

  // Found while implementing Task 4: campaign-items.ts's currencySchema is
  // `z.object({cp,sp,gp,pp}).partial()`, so a DM typing "5000 gp" persists
  // Item.cost as `{gp: 5000}` with no cp/sp/pp keys — asCurrency is an
  // unchecked cast (Json column), so that shape reaches the builder looking
  // like a full Currency. snapshotCostSchema is strict and rejects a missing
  // key, so every such campaign item would throw at award/backfill time
  // without this.
  it("fills a partial cost's missing denominations with 0 rather than failing to parse", () => {
    const snap = buildInventorySnapshot({ ...ROW_WITH_EVERYTHING, cost: { gp: 5000 } as SnapshotSourceRow["cost"] });
    expect(snap.cost).toEqual({ cp: 0, sp: 0, gp: 5000, pp: 0 });
  });
});

// ── The four creation paths write a snapshot (+ InventoryCapabilityUse) ─────
//
// applyAcquire covers BOTH catalog and custom (the branch is upstream in
// resolveAcquireSource) but is tested as two cases here since they populate
// different fields; awardCampaignItem; recreateDeletedItem (inventory-revert.ts,
// reached via revertInventoryEvent); and character creation's NESTED
// `inventoryItems: { create: [...] }` — the one a grep for `inventoryItem.create`
// misses. One test per path, no shared helper: a shared helper would let a
// missed call site pass on its neighbour's coverage.

const OWNER_ID = "owner-inventory-snapshot-dual-write";

const BASE_CHAR = {
  alignment: "Neutral",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

async function makeCharacter(): Promise<string> {
  const character = await prisma.character.create({
    data: { ...BASE_CHAR, name: "Snapshot-Write Fixture", ownerId: OWNER_ID, spellcasting: Prisma.JsonNull },
  });
  return character.id;
}

describe("the four creation paths write a snapshot (#1649)", () => {
  // Accumulated (never spliced) across every test in this describe block, not
  // cleared per-test: the final guard test needs every character this suite
  // created still present so its check is SCOPED to this suite's own writes,
  // not a database-wide count that would also see unrelated test files' raw
  // (non-app-layer) InventoryItem fixtures and fail on rows this issue never
  // touches. Cleaned up once, in afterAll.
  const characterIds: string[] = [];
  const campaignIds: string[] = [];
  const itemIds: string[] = [];

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: { in: characterIds } } });
    await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
    await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
  });

  it("applyAcquire (catalog) writes a snapshot agreeing with the catalog source", async () => {
    const item = await prisma.item.create({
      data: {
        scopeKey: "global",
        name: `Snapshot-Write Catalog Weapon ${randomUUID()}`,
        category: "weapon",
        weight: 3,
        cost: { cp: 0, sp: 0, gp: 15, pp: 0 },
        weaponDetail: { create: { damageDiceCount: 1, damageDiceFaces: 8, damageType: "slashing", weaponClass: "martial", weaponRange: "melee" } },
      },
    });
    itemIds.push(item.id);
    const characterId = await makeCharacter();
    characterIds.push(characterId);

    await applyInventoryOperations(characterId, [{ type: "acquire", itemId: item.id, quantity: 1 }]);

    const row = await prisma.inventoryItem.findFirstOrThrow({ where: { characterId } });
    expect(row.snapshot).not.toBeNull();
    const parsed = inventorySnapshotSchema.parse(row.snapshot);
    expect(parsed.name).toBe(item.name);
    expect(parsed.category).toBe("weapon");
    expect(parsed.weapon).toMatchObject({ damageDiceCount: 1, damageDiceFaces: 8, damageType: "slashing" });
    expect(parsed.capabilities).toEqual([]);
  });

  it("applyAcquire (custom) writes a snapshot, and promotes a charged consumable's usesRemaining onto the row", async () => {
    const characterId = await makeCharacter();
    characterIds.push(characterId);

    await applyInventoryOperations(characterId, [
      {
        type: "acquire",
        custom: {
          name: "Homebrew Elixir",
          category: "consumable",
          consumable: { effectDiceCount: 2, effectDiceFaces: 4, effectDescription: "Heals", maxUses: 3 },
        },
        quantity: 1,
      },
    ]);

    const row = await prisma.inventoryItem.findFirstOrThrow({ where: { characterId } });
    expect(row.snapshot).not.toBeNull();
    const parsed = inventorySnapshotSchema.parse(row.snapshot);
    expect(parsed.consumable).toEqual({ effectDiceCount: 2, effectDiceFaces: 4, effectModifier: null, effectDescription: "Heals", maxUses: 3 });
    // A fresh charged consumable starts full — usesRemaining lives directly on
    // InventoryItem (promoted out of InventoryConsumableDetail by #1648).
    expect(row.usesRemaining).toBe(3);
  });

  it("awardCampaignItem writes a snapshot keyed to a fresh InventoryCapabilityUse row", async () => {
    const campaign = await prisma.campaign.create({ data: { name: "Snapshot-Write Loot", ownerId: OWNER_ID, inviteCode: randomUUID() } });
    campaignIds.push(campaign.id);
    const characterId = await makeCharacter();
    characterIds.push(characterId);
    await prisma.character.update({ where: { id: characterId }, data: { campaignId: campaign.id } });

    const campaignItem = await prisma.item.create({
      data: {
        campaignId: campaign.id,
        scope: "CAMPAIGN",
        scopeKey: `campaign:${campaign.id}`,
        name: "Cloak of Snapshot-Writing",
        category: "gear",
        capabilities: { create: [{ kind: "passiveBonus", target: "ac", op: "add", value: 1 }] },
      },
    });
    itemIds.push(campaignItem.id);

    await awardCampaignItem({ campaignId: campaign.id, campaignItemId: campaignItem.id, characterId, quantity: 1 });

    const row = await prisma.inventoryItem.findFirstOrThrow({ where: { characterId, itemId: campaignItem.id } });
    expect(row.snapshot).not.toBeNull();
    const parsed = inventorySnapshotSchema.parse(row.snapshot);
    expect(parsed.capabilities).toHaveLength(1);
    const capKey = parsed.capabilities[0].key;
    expect(parsed.capabilities).toEqual([
      { key: capKey, kind: "passiveBonus", target: "ac", op: "add", value: 1, targetKey: null, condition: null, description: null, dice: null },
    ]);

    const use = await prisma.inventoryCapabilityUse.findFirstOrThrow({ where: { inventoryItemId: row.id } });
    expect(use.capabilityKey).toBe(capKey);
    expect(use.used).toBe(0);
  });

  it("recreateDeletedItem (undo of a revoke) restores the same capability key and used counter verbatim", async () => {
    const campaign = await prisma.campaign.create({ data: { name: "Snapshot-Write Revoke", ownerId: OWNER_ID, inviteCode: randomUUID() } });
    campaignIds.push(campaign.id);
    const characterId = await makeCharacter();
    characterIds.push(characterId);
    await prisma.character.update({ where: { id: characterId }, data: { campaignId: campaign.id } });

    const campaignItem = await prisma.item.create({
      data: {
        campaignId: campaign.id,
        scope: "CAMPAIGN",
        scopeKey: `campaign:${campaign.id}`,
        name: "Wand of Snapshot-Writing",
        category: "gear",
        capabilities: { create: [{ kind: "charges", maxCharges: 5, rechargeTrigger: "dawn" }] },
      },
    });
    itemIds.push(campaignItem.id);

    await awardCampaignItem({ campaignId: campaign.id, campaignItemId: campaignItem.id, characterId, quantity: 1 });
    const awarded = await prisma.inventoryItem.findFirstOrThrow({ where: { characterId, itemId: campaignItem.id } });
    const originalKey = inventorySnapshotSchema.parse(awarded.snapshot).capabilities[0].key;
    // Simulate 2 charges already spent before the item was revoked, so the
    // undo-recreate's "preserve `used` verbatim" behavior has something to prove.
    await prisma.inventoryCapabilityUse.updateMany({
      where: { inventoryItemId: awarded.id, capabilityKey: originalKey },
      data: { used: 2 },
    });

    await revokeCampaignItem({ campaignId: campaign.id, campaignItemId: campaignItem.id, characterId });
    const revokedEvent = await prisma.characterEvent.findFirstOrThrow({
      where: { characterId, type: "revoked", entityId: awarded.id },
    });

    await prisma.$transaction((tx) => revertInventoryEvent(tx, characterId, revokedEvent));

    const recreated = await prisma.inventoryItem.findFirstOrThrow({ where: { id: awarded.id } });
    expect(recreated.snapshot).not.toBeNull();
    const parsed = inventorySnapshotSchema.parse(recreated.snapshot);
    expect(parsed.capabilities).toHaveLength(1);
    // #1649: a capability's key is no longer a live InventoryCapability row's
    // id — it's just an opaque string carried inside the snapshot blob — so a
    // recreate restores the SAME key rather than minting a new one.
    expect(parsed.capabilities[0].key).toBe(originalKey);
    expect(parsed.capabilities[0]).toMatchObject({ kind: "charges", maxCharges: 5 });

    const use = await prisma.inventoryCapabilityUse.findFirstOrThrow({ where: { inventoryItemId: recreated.id } });
    expect(use.capabilityKey).toBe(originalKey);
    expect(use.used).toBe(2);
  });

  it("character creation's nested inventoryItems create writes a snapshot on every starting-gear row", async () => {
    const speciesId = await seededSpeciesId("Human", "EDITION_2014");
    const result = await createCharacter(
      {
        name: "Snapshot-Write Wizard",
        alignment: "Neutral Good",
        speciesId,
        background: "Sage",
        classes: [{ name: "Wizard" }],
        abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 15, wisdom: 10, charisma: 10 },
        skillProficiencies: ["arcana", "history"],
        rulesEdition: "EDITION_2014",
        startingEquipment: {
          mode: "package",
          selections: [{ optionIndex: 0 }, { optionIndex: 0 }, { optionIndex: 0 }, { optionIndex: 0 }],
        },
      } as never,
      OWNER_ID,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    characterIds.push(result.id);

    const rows = await prisma.inventoryItem.findMany({ where: { characterId: result.id } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.snapshot, `${row.name} should carry a snapshot`).not.toBeNull();
      const parsed = inventorySnapshotSchema.safeParse(row.snapshot);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
  });

  // Scoped to the characters THIS suite created (see the characterIds comment
  // above) so it can't fail on an unrelated file's raw, non-app-layer fixture rows.
  it("every InventoryItem created in this suite carries a snapshot", async () => {
    expect(
      await prisma.inventoryItem.count({
        where: { characterId: { in: characterIds }, snapshot: { equals: Prisma.DbNull } },
      }),
    ).toBe(0);
  });
});

// ── Mutable inventory state writes to its single home (#1649) ──────────────
//
// activatedUsesSpent is already an InventoryItem column, unmoved by this
// issue. One scenario per write family the AC names: a rest sweep, a
// consumable use, an item spell cast, an activation, and an undo.

const MUTABLE_SPELL = {
  name: "Snapshot-Write Mutable Spell",
  level: 1,
  school: "evocation" as const,
  castingTime: "1 action",
  range: "30 ft",
  duration: "Instantaneous",
  description: "Test spell.",
  concentration: false,
  effectKind: "damage",
  effectDiceCount: 1,
  effectDiceFaces: 6,
  damageType: "force",
};

async function capabilityUse(capabilityKey: string) {
  return prisma.inventoryCapabilityUse.findFirstOrThrow({ where: { capabilityKey } });
}

describe("mutable inventory state writes only its single home (#1649)", () => {
  let spellId: string;
  const characterIds: string[] = [];

  beforeAll(async () => {
    await ensureTestOwner(OWNER_ID);
    // upsertEditionRow, not .upsert(): Spell's business key is now (name,
    // edition) (#1710), and this fixture spell is edition-neutral.
    // catalogEntryId (#1796) is resolved first — required, no default.
    const catalogEntryId = await makeCatalogEntry({ name: MUTABLE_SPELL.name });
    const spell = await upsertEditionRow(
      prisma.spell,
      { name: MUTABLE_SPELL.name, edition: null },
      { ...MUTABLE_SPELL, edition: null, catalogEntryId },
      MUTABLE_SPELL,
    );
    spellId = spell.id;
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: { in: characterIds } } });
    // Deleting the CatalogEntry cascades the Spell row (ON DELETE CASCADE,
    // #1796) — the reverse cascade doesn't exist (the supertype stays
    // closed), so a plain `spell.deleteMany` alone would orphan the entry.
    await prisma.catalogEntry.deleteMany({ where: { name: MUTABLE_SPELL.name, kind: "SPELL" } });
  });

  it("a long rest recharges a charge pool, resets an item-spell counter, and recharges a consumable", async () => {
    const characterId = await makeCharacter();
    characterIds.push(characterId);

    const poolCapId = randomUUID();
    const castCapId = randomUUID();
    const wand = await prisma.inventoryItem.create({
      data: inventoryItemFixtureData({
        characterId,
        name: "Snapshot-Write Wand",
        category: "gear",
        requiresAttunement: true,
        attuned: true,
        capabilities: [
          { id: poolCapId, kind: "charges", maxCharges: 7, rechargeTrigger: "dawn", rechargeBonus: 2, used: 4 },
          { id: castCapId, kind: "castSpell", spellId, spellName: "Test Spell", spellLevel: 1, castLevel: 1, castResource: "perRestShort", castUses: 2, used: 2 },
        ],
      }),
    });
    await prisma.inventoryCapabilityUse.updateMany({ where: { inventoryItemId: wand.id, capabilityKey: poolCapId }, data: { used: 4 } });
    await prisma.inventoryCapabilityUse.updateMany({ where: { inventoryItemId: wand.id, capabilityKey: castCapId }, data: { used: 2 } });

    const potion = await prisma.inventoryItem.create({
      data: inventoryItemFixtureData({
        characterId,
        name: "Snapshot-Write Potion",
        category: "consumable",
        consumable: { maxUses: 3, usesRemaining: 1 },
      }),
    });

    await applyHitPointOperations(characterId, [{ type: "longRest" }]);

    // rechargeOneChargePool: dawn triggers on a long rest; no rechargeDice, so
    // the regain is the flat rechargeBonus (2) — nextUsed = max(0, 4-2).
    expect((await capabilityUse(poolCapId)).used).toBe(2);
    // resetItemSpellUsesOnRest: perRestShort recharges on short OR long.
    expect((await capabilityUse(castCapId)).used).toBe(0);

    const potionRow = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: potion.id } });
    expect(potionRow.usesRemaining).toBe(3);
  });

  it("a consumable use writes usesRemaining onto InventoryItem", async () => {
    const characterId = await makeCharacter();
    characterIds.push(characterId);
    const item = await prisma.inventoryItem.create({
      data: inventoryItemFixtureData({
        characterId,
        name: "Snapshot-Write Elixir",
        category: "consumable",
        consumable: { maxUses: 3, usesRemaining: 2 },
      }),
    });

    await applyInventoryOperations(characterId, [{ type: "use", inventoryItemId: item.id }]);

    const row = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(row.usesRemaining).toBe(1);
  });

  it("an item-spell cast (per-capability counter) writes `used` onto InventoryCapabilityUse", async () => {
    const characterId = await makeCharacter();
    characterIds.push(characterId);
    const castCapId = randomUUID();
    const item = await prisma.inventoryItem.create({
      data: inventoryItemFixtureData({
        characterId,
        name: "Snapshot-Write Ring",
        category: "gear",
        requiresAttunement: true,
        attuned: true,
        capabilities: [{ id: castCapId, kind: "castSpell", spellId, spellName: "Test Spell", spellLevel: 1, castLevel: 1, castResource: "perRestShort", castUses: 2 }],
      }),
    });
    const entryId = `item:${item.id}:${spellId}:${castCapId}`;

    await applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId, roll: 9 }], OWNER_ID);

    expect((await capabilityUse(castCapId)).used).toBe(1);
  });

  it("an item-spell cast (shared charges pool) writes `used` onto InventoryCapabilityUse", async () => {
    const characterId = await makeCharacter();
    characterIds.push(characterId);
    const poolCapId = randomUUID();
    const castCapId = randomUUID();
    const item = await prisma.inventoryItem.create({
      data: inventoryItemFixtureData({
        characterId,
        name: "Snapshot-Write Charged Wand",
        category: "gear",
        requiresAttunement: true,
        attuned: true,
        capabilities: [
          { id: poolCapId, kind: "charges", maxCharges: 7, rechargeTrigger: "dawn" },
          { id: castCapId, kind: "castSpell", spellId, spellName: "Test Spell", spellLevel: 1, castLevel: 1, castResource: "charges", chargeCost: 3 },
        ],
      }),
    });
    const entryId = `item:${item.id}:${spellId}:${castCapId}`;

    await applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId, roll: 9 }], OWNER_ID);

    expect((await capabilityUse(poolCapId)).used).toBe(3);
  });

  it("a charges-costed activation writes the pool's `used` onto InventoryCapabilityUse", async () => {
    const characterId = await makeCharacter();
    characterIds.push(characterId);
    const poolCapId = randomUUID();
    const item = await prisma.inventoryItem.create({
      data: inventoryItemFixtureData({
        characterId,
        name: "Snapshot-Write Activation Wand",
        category: "gear",
        requiresAttunement: true,
        attuned: true,
        capabilities: [
          { id: poolCapId, kind: "charges", maxCharges: 7, rechargeTrigger: "dawn" },
          {
            id: randomUUID(),
            kind: "activatedEffect",
            activation: "commandWord",
            target: "ac",
            op: "add",
            value: 1,
            activatedDuration: "whileActive",
            resourceKind: "charges",
            chargeCost: 2,
          },
        ],
      }),
    });

    await applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: item.id }]);

    expect((await capabilityUse(poolCapId)).used).toBe(2);
  });

  it("undo restores usesRemaining alongside InventoryItem's own column", async () => {
    const characterId = await makeCharacter();
    characterIds.push(characterId);
    const item = await prisma.inventoryItem.create({
      data: inventoryItemFixtureData({
        characterId,
        name: "Snapshot-Write Undo Elixir",
        category: "consumable",
        consumable: { maxUses: 3, usesRemaining: 2 },
      }),
    });
    await applyInventoryOperations(characterId, [{ type: "use", inventoryItemId: item.id }]);
    const useEvent = await prisma.characterEvent.findFirstOrThrow({ where: { characterId, type: "consumed" } });

    await prisma.$transaction((tx) => revertInventoryEvent(tx, characterId, useEvent));

    const row = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(row.usesRemaining).toBe(2);
  });

  it("undo of a charges-costed activation restores the pool's `used` too", async () => {
    const characterId = await makeCharacter();
    characterIds.push(characterId);
    const poolCapId = randomUUID();
    const item = await prisma.inventoryItem.create({
      data: inventoryItemFixtureData({
        characterId,
        name: "Snapshot-Write Undo Activation Wand",
        category: "gear",
        requiresAttunement: true,
        attuned: true,
        capabilities: [
          { id: poolCapId, kind: "charges", maxCharges: 7, rechargeTrigger: "dawn" },
          {
            id: randomUUID(),
            kind: "activatedEffect",
            activation: "commandWord",
            target: "ac",
            op: "add",
            value: 1,
            activatedDuration: "whileActive",
            resourceKind: "charges",
            chargeCost: 2,
          },
        ],
      }),
    });

    await applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: item.id }]);
    expect((await capabilityUse(poolCapId)).used).toBe(2);
    const activateEvent = await prisma.characterEvent.findFirstOrThrow({ where: { characterId, type: "activated" } });

    const undone = await revertBatch(prisma, characterId, activateEvent.batchId!);
    expect(undone.ok).toBe(true);

    expect((await capabilityUse(poolCapId)).used).toBe(0);
  });
});
