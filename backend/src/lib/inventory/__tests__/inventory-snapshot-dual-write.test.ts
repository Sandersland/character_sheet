// buildInventorySnapshot (#1648, epic #1644) — the one construction function
// every creation path calls. Assembled first against a hand-built row so the
// mapping is verified in isolation before Tasks 4/5 wire it into the real
// creation/mutation call sites (this file grows a describe block per task).
import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { inventorySnapshotSchema } from "@character-sheet/contracts";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { applyInventoryOperations, revertInventoryEvent } from "@/lib/inventory/inventory.js";
import { awardCampaignItem, revokeCampaignItem } from "@/lib/campaign/campaign-item-award.js";
import { createCharacter } from "@/lib/character/character-create.js";
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

// ── Task 4: dual-write the four creation paths ──────────────────────────────
//
// Four call sites create an InventoryItem row (#1648's "what the issue gets
// wrong" #1): applyAcquire covers BOTH catalog and custom (the branch is
// upstream in resolveAcquireSource) but is tested as two cases here since
// they populate different fields; awardCampaignItem; recreateDeletedItem
// (inventory-revert.ts, reached via revertInventoryEvent); and character
// creation's NESTED `inventoryItems: { create: [...] }` — the one a grep for
// `inventoryItem.create` misses. One test per path, no shared helper: a
// shared helper would let a missed call site pass on its neighbour's coverage.

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
    data: { ...BASE_CHAR, name: "Dual-Write Fixture", ownerId: OWNER_ID, spellcasting: Prisma.JsonNull },
  });
  return character.id;
}

describe("dual-write the four creation paths (#1648)", () => {
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
        name: `Dual-Write Catalog Weapon ${randomUUID()}`,
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

  it("applyAcquire (custom) writes a snapshot, and mirrors a charged consumable's usesRemaining onto the row", async () => {
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
    // A fresh charged consumable starts full — usesRemaining now also lives
    // directly on InventoryItem (promoted out of InventoryConsumableDetail).
    expect(row.usesRemaining).toBe(3);
  });

  it("awardCampaignItem writes a snapshot keyed to fresh InventoryCapabilityUse rows", async () => {
    const campaign = await prisma.campaign.create({ data: { name: "Dual-Write Loot", ownerId: OWNER_ID, inviteCode: randomUUID() } });
    campaignIds.push(campaign.id);
    const characterId = await makeCharacter();
    characterIds.push(characterId);
    await prisma.character.update({ where: { id: characterId }, data: { campaignId: campaign.id } });

    const campaignItem = await prisma.item.create({
      data: {
        campaignId: campaign.id,
        scope: "CAMPAIGN",
        scopeKey: `campaign:${campaign.id}`,
        name: "Cloak of Dual-Writing",
        category: "gear",
        capabilities: { create: [{ kind: "passiveBonus", target: "ac", op: "add", value: 1 }] },
      },
    });
    itemIds.push(campaignItem.id);

    await awardCampaignItem({ campaignId: campaign.id, campaignItemId: campaignItem.id, characterId, quantity: 1 });

    const row = await prisma.inventoryItem.findFirstOrThrow({
      where: { characterId, itemId: campaignItem.id },
      include: { capabilities: true },
    });
    expect(row.snapshot).not.toBeNull();
    const parsed = inventorySnapshotSchema.parse(row.snapshot);
    expect(row.capabilities).toHaveLength(1);
    expect(parsed.capabilities).toEqual([
      { key: row.capabilities[0].id, kind: "passiveBonus", target: "ac", op: "add", value: 1, targetKey: null, condition: null, description: null, dice: null },
    ]);

    const use = await prisma.inventoryCapabilityUse.findFirstOrThrow({ where: { inventoryItemId: row.id } });
    expect(use.capabilityKey).toBe(row.capabilities[0].id);
    expect(use.used).toBe(0);
  });

  it("recreateDeletedItem (undo of a revoke) re-keys capabilities and preserves used verbatim", async () => {
    const campaign = await prisma.campaign.create({ data: { name: "Dual-Write Revoke", ownerId: OWNER_ID, inviteCode: randomUUID() } });
    campaignIds.push(campaign.id);
    const characterId = await makeCharacter();
    characterIds.push(characterId);
    await prisma.character.update({ where: { id: characterId }, data: { campaignId: campaign.id } });

    const campaignItem = await prisma.item.create({
      data: {
        campaignId: campaign.id,
        scope: "CAMPAIGN",
        scopeKey: `campaign:${campaign.id}`,
        name: "Wand of Dual-Writing",
        category: "gear",
        capabilities: { create: [{ kind: "charges", maxCharges: 5, rechargeTrigger: "dawn" }] },
      },
    });
    itemIds.push(campaignItem.id);

    await awardCampaignItem({ campaignId: campaign.id, campaignItemId: campaignItem.id, characterId, quantity: 1 });
    const awarded = await prisma.inventoryItem.findFirstOrThrow({
      where: { characterId, itemId: campaignItem.id },
      include: { capabilities: true },
    });
    const originalCapabilityId = awarded.capabilities[0].id;
    // Simulate 2 charges already spent before the item was revoked, so the
    // undo-recreate's "preserve `used` verbatim" behavior has something to prove.
    await prisma.inventoryCapability.update({ where: { id: originalCapabilityId }, data: { used: 2 } });

    await revokeCampaignItem({ campaignId: campaign.id, campaignItemId: campaignItem.id, characterId });
    const revokedEvent = await prisma.characterEvent.findFirstOrThrow({
      where: { characterId, type: "revoked", entityId: awarded.id },
    });

    await prisma.$transaction((tx) => revertInventoryEvent(tx, characterId, revokedEvent));

    const recreated = await prisma.inventoryItem.findFirstOrThrow({
      where: { id: awarded.id },
      include: { capabilities: true },
    });
    expect(recreated.snapshot).not.toBeNull();
    const parsed = inventorySnapshotSchema.parse(recreated.snapshot);
    expect(recreated.capabilities).toHaveLength(1);
    // A recreate mints a NEW capability row id (#1649 deletes the row a stale
    // id would otherwise point at) — the snapshot key follows it.
    expect(recreated.capabilities[0].id).not.toBe(originalCapabilityId);
    expect(parsed.capabilities[0]).toMatchObject({ key: recreated.capabilities[0].id, kind: "charges", maxCharges: 5 });

    const use = await prisma.inventoryCapabilityUse.findFirstOrThrow({ where: { inventoryItemId: recreated.id } });
    expect(use.capabilityKey).toBe(recreated.capabilities[0].id);
    expect(use.used).toBe(2);
  });

  it("character creation's nested inventoryItems create writes a snapshot on every starting-gear row", async () => {
    const result = await createCharacter(
      {
        name: "Dual-Write Wizard",
        alignment: "Neutral Good",
        race: "Human",
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

  // Nullability is temporary (#1649 makes it NOT NULL); until then this is
  // what stops a forgotten write path from being invisible. Scoped to the
  // characters THIS suite created (see the characterIds comment above) so it
  // can't fail on an unrelated file's raw, non-app-layer fixture rows.
  it("every InventoryItem created in this suite carries a snapshot", async () => {
    expect(
      await prisma.inventoryItem.count({
        where: { characterId: { in: characterIds }, snapshot: { equals: Prisma.DbNull } },
      }),
    ).toBe(0);
  });
});
