/**
 * The invariants the CampaignItem→Item merge has to preserve (#1646, epic
 * #1644). Scoped to rows this file creates: the worker DB is shared and other
 * suites leak throwaway Item rows with no cleanup.
 *
 * These are deliberately behavioural rather than structural — "two campaigns
 * can both hold a Sunblade" is the property that would break if scopeKey were
 * ever computed wrong, and it survives the table rename that a column-level
 * assertion would not.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";

const OWNER_ID = "owner-campaign-item-merge";
const MADE_CAMPAIGNS: string[] = [];

async function makeCampaign(name: string) {
  const campaign = await prisma.campaign.create({
    data: { name, ownerId: OWNER_ID, inviteCode: randomUUID(), members: { create: { userId: OWNER_ID, role: "OWNER" } } },
  });
  MADE_CAMPAIGNS.push(campaign.id);
  return campaign;
}

async function makeCampaignItem(campaignId: string, name: string) {
  return prisma.item.create({
    data: { name, category: "gear", scope: "CAMPAIGN", scopeKey: `campaign:${campaignId}`, campaignId },
  });
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
});

afterAll(async () => {
  await prisma.campaign.deleteMany({ where: { id: { in: MADE_CAMPAIGNS.splice(0) } } });
});

describe("CampaignItem rows live in Item (#1646)", () => {
  it("lets two different campaigns each hold an item named Sunblade", async () => {
    const a = await makeCampaign("Merge Campaign A");
    const b = await makeCampaign("Merge Campaign B");

    await expect(makeCampaignItem(a.id, "Sunblade")).resolves.toBeTruthy();
    await expect(makeCampaignItem(b.id, "Sunblade")).resolves.toBeTruthy();
  });

  it("lets a campaign item duplicate a catalog item's name", async () => {
    const campaign = await makeCampaign("Merge Campaign Shadow");
    await expect(makeCampaignItem(campaign.id, "Longsword")).resolves.toBeTruthy();
  });

  it("scopes a campaign's item list to that campaign", async () => {
    const a = await makeCampaign("Merge Campaign Scoped A");
    const b = await makeCampaign("Merge Campaign Scoped B");
    await makeCampaignItem(a.id, "A-only Relic");
    await makeCampaignItem(b.id, "B-only Relic");

    const forA = await prisma.item.findMany({ where: { scope: "CAMPAIGN", campaignId: a.id }, select: { name: true } });
    expect(forA.map((r) => r.name)).toEqual(["A-only Relic"]);
  });

  const CHAR_FIELDS = {
    initiativeBonus: 0,
    speed: 30,
    hitPoints: { current: 10, max: 10, temp: 0 },
    hitDice: { total: 1, die: "d8" },
    abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    savingThrowProficiencies: [] as string[],
    skills: [],
    toolProficiencies: [],
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  };

  it("leaves an awarded snapshot intact with itemId null when the source item is deleted", async () => {
    const campaign = await makeCampaign("Merge Campaign Award");
    const source = await makeCampaignItem(campaign.id, "Doomed Blade");
    const character = await prisma.character.create({
      data: { name: "Merge Fixture", ownerId: OWNER_ID, alignment: "True Neutral", ...CHAR_FIELDS },
    });
    const awarded = await prisma.inventoryItem.create({
      data: { characterId: character.id, itemId: source.id, name: "Doomed Blade", category: "gear", quantity: 1 },
    });

    await prisma.item.delete({ where: { id: source.id } });

    const after = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: awarded.id } });
    expect(after.itemId).toBeNull();
    expect(after.name).toBe("Doomed Blade");

    await prisma.character.delete({ where: { id: character.id } });
  });

  // GH #1646 review comment (PR #1650, added scope finding #1): Item.campaignId
  // cascades from Campaign while InventoryItem.itemId only SetNulls, so deleting
  // a campaign transitively drops provenance on every character holding one of
  // its CAMPAIGN items. This is #1645's cascade shape, not new to this issue —
  // pinning it here is what makes it a documented choice instead of a surprise.
  it("survives a campaign deletion with itemId null (Item cascades, InventoryItem does not)", async () => {
    const campaign = await makeCampaign("Merge Campaign Cascade");
    const source = await makeCampaignItem(campaign.id, "Cascade Blade");
    const character = await prisma.character.create({
      data: { name: "Cascade Fixture", ownerId: OWNER_ID, alignment: "True Neutral", ...CHAR_FIELDS },
    });
    const awarded = await prisma.inventoryItem.create({
      data: { characterId: character.id, itemId: source.id, name: "Cascade Blade", category: "gear", quantity: 1 },
    });

    await prisma.campaign.delete({ where: { id: campaign.id } });
    MADE_CAMPAIGNS.splice(MADE_CAMPAIGNS.indexOf(campaign.id), 1);

    expect(await prisma.item.findUnique({ where: { id: source.id } })).toBeNull();
    const after = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: awarded.id } });
    expect(after.itemId).toBeNull();
    expect(after.name).toBe("Cascade Blade");

    await prisma.character.delete({ where: { id: character.id } });
  });
});
