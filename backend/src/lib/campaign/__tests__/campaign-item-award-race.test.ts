import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { awardCampaignItem } from "@/lib/campaign/campaign-item-award.js";

const OWNER_ID = "owner-award-race-lib";

const BASE_CHAR = {
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

describe("concurrent unique-item awards (#2026)", () => {
  let campaignId: string;
  let characterIds: string[];
  let campaignItemId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    const campaign = await prisma.campaign.create({
      data: { name: "Race Loot", ownerId: OWNER_ID, inviteCode: randomUUID() },
    });
    campaignId = campaign.id;
    characterIds = [];
    for (const name of ["Racer A", "Racer B", "Racer C", "Racer D"]) {
      const c = await prisma.character.create({
        data: { ...BASE_CHAR, name, ownerId: OWNER_ID, spellcasting: Prisma.JsonNull, campaignId },
      });
      characterIds.push(c.id);
    }
    const item = await prisma.item.create({
      data: {
        campaignId,
        scope: "CAMPAIGN",
        scopeKey: `campaign:${campaignId}`,
        name: "Sunblade",
        category: "gear",
        isUnique: true,
      },
    });
    campaignItemId = item.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: { in: characterIds } } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
  });

  it("lets exactly one of several parallel awards succeed", async () => {
    const results = await Promise.allSettled(
      characterIds.map((characterId) => awardCampaignItem({ campaignId, campaignItemId, characterId, quantity: 1 })),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(3);
    for (const r of rejected) {
      expect(r.reason).toMatchObject({ status: 409 });
      expect(String(r.reason.message)).toMatch(/is unique and already held by/);
    }
    expect(await prisma.inventoryItem.count({ where: { itemId: campaignItemId } })).toBe(1);
  });
});
