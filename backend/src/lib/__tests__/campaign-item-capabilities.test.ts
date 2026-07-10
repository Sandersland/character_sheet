import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { awardCampaignItem } from "@/lib/campaign-item-award.js";
import { inventoryItemDetailInclude } from "@/lib/inventory/inventory.js";

const OWNER_ID = "owner-cap-award-lib";

const BASE_CHAR = {
  name: "Cap Award Fixture",
  alignment: "Lawful Good",
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

describe("capability snapshot on award (#545)", () => {
  let campaignId: string;
  let characterId: string;
  let campaignItemId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    const campaign = await prisma.campaign.create({
      data: { name: "Cap Loot", ownerId: OWNER_ID, inviteCode: randomUUID() },
    });
    campaignId = campaign.id;

    const character = await prisma.character.create({
      data: { ...BASE_CHAR, ownerId: OWNER_ID, spellcasting: Prisma.JsonNull, campaignId },
    });
    characterId = character.id;

    const item = await prisma.campaignItem.create({
      data: {
        campaignId,
        name: "Cloak of Elvenkind",
        category: "gear",
        requiresAttunement: true,
        attunementPrereqKind: "species",
        attunementPrereqValue: "Elf",
        capabilities: {
          create: [
            { kind: "passiveBonus", target: "skill", op: "add", value: 2, targetKey: "stealth", description: "+2 Stealth" },
            { kind: "passiveBonus", target: "damage", op: "add", value: 0, valueDiceCount: 1, valueDiceFaces: 6, valueDamageType: "fire" },
          ],
        },
      },
    });
    campaignItemId = item.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: characterId } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
  });

  it("snapshots capabilities + attunement prereq onto the awarded InventoryItem", async () => {
    await awardCampaignItem({ campaignId, campaignItemId, characterId, quantity: 1 });

    const row = await prisma.inventoryItem.findFirstOrThrow({
      where: { characterId, campaignItemId },
      include: inventoryItemDetailInclude,
    });

    expect(row.requiresAttunement).toBe(true);
    expect(row.attunementPrereqKind).toBe("species");
    expect(row.attunementPrereqValue).toBe("Elf");
    expect(row.capabilities).toHaveLength(2);

    const scalar = row.capabilities.find((c) => c.targetKey === "stealth");
    expect(scalar).toMatchObject({ kind: "passiveBonus", target: "skill", op: "add", value: 2 });

    // The dice-valued capability round-trips count/faces/damageType intact.
    const dice = row.capabilities.find((c) => c.valueDiceCount !== null);
    expect(dice).toMatchObject({ valueDiceCount: 1, valueDiceFaces: 6, valueDamageType: "fire" });
  });

  it("snapshots the charges pool columns; the awarded pool starts full (used = 0) (#555)", async () => {
    const wand = await prisma.campaignItem.create({
      data: {
        campaignId,
        name: "Wand of Magic Missiles",
        category: "gear",
        capabilities: {
          create: [
            {
              kind: "charges",
              maxCharges: 7,
              rechargeDiceCount: 1,
              rechargeDiceFaces: 6,
              rechargeBonus: 1,
              rechargeTrigger: "dawn",
            },
            {
              kind: "castSpell",
              spellId: "spell-mm",
              spellName: "Magic Missile",
              spellLevel: 1,
              castLevel: 1,
              castResource: "charges",
              chargeCost: 1,
              dcMode: "fixed",
              attackMode: "fixed",
            },
          ],
        },
      },
    });

    await awardCampaignItem({ campaignId, campaignItemId: wand.id, characterId, quantity: 1 });

    const row = await prisma.inventoryItem.findFirstOrThrow({
      where: { characterId, campaignItemId: wand.id },
      include: inventoryItemDetailInclude,
    });
    const pool = row.capabilities.find((c) => c.kind === "charges")!;
    expect(pool).toMatchObject({
      maxCharges: 7,
      rechargeDiceCount: 1,
      rechargeDiceFaces: 6,
      rechargeBonus: 1,
      rechargeTrigger: "dawn",
      used: 0, // runtime counter never copied — awarded pool starts full
    });
    const cast = row.capabilities.find((c) => c.kind === "castSpell")!;
    expect(cast).toMatchObject({ castResource: "charges", chargeCost: 1 });
  });

  it("keeps the snapshot after the source CampaignItem is deleted (provenance FK SetNull)", async () => {
    await awardCampaignItem({ campaignId, campaignItemId, characterId, quantity: 1 });
    await prisma.campaignItem.delete({ where: { id: campaignItemId } });

    const row = await prisma.inventoryItem.findFirstOrThrow({
      where: { characterId },
      include: inventoryItemDetailInclude,
    });
    // Provenance FK nulled by SetNull, but the snapshotted capabilities survive.
    expect(row.campaignItemId).toBeNull();
    expect(row.capabilities).toHaveLength(2);
    expect(row.requiresAttunement).toBe(true);
    expect(row.attunementPrereqValue).toBe("Elf");
  });
});
