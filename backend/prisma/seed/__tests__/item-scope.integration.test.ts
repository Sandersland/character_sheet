// DB-touching pin (#1645, epic #1644): the rule is "a name is unique among
// GLOBAL rows only", and a non-null scopeKey is its only expressible form here.
// @@unique([campaignId, name]) is SILENTLY wrong — Postgres treats NULLs as
// distinct, so two catalog rows named 'Longsword' would both insert — and
// Prisma 7.8 rejects `nullsNotDistinct`. These assertions prove the index and
// the agreement CHECK behave as intended rather than merely existing; a
// shape-only assertion would have passed against the broken form too.
//
// Scoped to rows this file creates (plus three named catalog rows): the worker
// DB is shared across the whole suite and other files create throwaway Item
// rows with no cleanup, so a full-table assertion would be a false negative on
// THEIR fixture leak.
import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";

const OWNER_ID = "item-scope-owner";
const MADE: string[] = [];
let campaignId: string;

async function makeGlobalItem(name: string) {
  const row = await prisma.item.create({
    data: { name, category: "gear", scope: "GLOBAL", scopeKey: "global" },
  });
  MADE.push(row.id);
  return row;
}

async function makeCampaignItem(name: string, forCampaignId = campaignId) {
  const row = await prisma.item.create({
    data: {
      name,
      category: "gear",
      scope: "CAMPAIGN",
      scopeKey: `campaign:${forCampaignId}`,
      campaignId: forCampaignId,
    },
  });
  MADE.push(row.id);
  return row;
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  const campaign = await prisma.campaign.create({
    data: {
      name: "Item Scope Campaign",
      ownerId: OWNER_ID,
      inviteCode: randomUUID(),
      members: { create: { userId: OWNER_ID, role: "OWNER" } },
    },
  });
  campaignId = campaign.id;
});

afterEach(async () => {
  if (MADE.length) await prisma.item.deleteMany({ where: { id: { in: MADE.splice(0) } } });
});

afterAll(async () => {
  await prisma.campaign.delete({ where: { id: campaignId } });
});

describe("Item scope discriminator (#1645)", () => {
  it("rejects a second GLOBAL row with the same name", async () => {
    await makeGlobalItem("Scope Fixture Blade");
    await expect(makeGlobalItem("Scope Fixture Blade")).rejects.toMatchObject({ code: "P2002" });
  });

  it("allows a campaign row to reuse a catalog name", async () => {
    await makeGlobalItem("Scope Fixture Twin");
    await expect(makeCampaignItem("Scope Fixture Twin")).resolves.toBeTruthy();
  });

  it("rejects a second row with the same name in the SAME campaign", async () => {
    await makeCampaignItem("Scope Fixture Relic");
    await expect(makeCampaignItem("Scope Fixture Relic")).rejects.toMatchObject({ code: "P2002" });
  });

  // The CHECK is what lets scopeKey be stored-but-derived without drifting.
  // Without it a CAMPAIGN row could sit in the catalog's uniqueness namespace.
  it("refuses a row whose scopeKey disagrees with its scope", async () => {
    await expect(
      prisma.item.create({
        data: { name: "Scope Fixture Liar", category: "gear", scope: "CAMPAIGN", scopeKey: "global", campaignId },
      }),
    ).rejects.toThrow(/Item_scope_key_agreement_check/);
  });

  it("refuses a CAMPAIGN row whose scopeKey names a different campaign", async () => {
    await expect(
      prisma.item.create({
        data: {
          name: "Scope Fixture Impostor",
          category: "gear",
          scope: "CAMPAIGN",
          scopeKey: `campaign:${randomUUID()}`,
          campaignId,
        },
      }),
    ).rejects.toThrow(/Item_scope_key_agreement_check/);
  });

  it("seeds catalog rows as GLOBAL with scopeKey 'global'", async () => {
    const rows = await prisma.item.findMany({
      where: { name: { in: ["Longsword", "Shield", "Dagger"] }, scopeKey: "global" },
      select: { name: true, scope: true, campaignId: true },
    });
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.scope).toBe("GLOBAL");
      expect(row.campaignId).toBeNull();
    }
  });

  it("cascades campaign-scoped rows when the campaign is deleted", async () => {
    const doomed = await prisma.campaign.create({
      data: {
        name: "Item Scope Doomed Campaign",
        ownerId: OWNER_ID,
        inviteCode: randomUUID(),
        members: { create: { userId: OWNER_ID, role: "OWNER" } },
      },
    });
    const item = await makeCampaignItem("Scope Fixture Doomed", doomed.id);

    await prisma.campaign.delete({ where: { id: doomed.id } });

    expect(await prisma.item.findUnique({ where: { id: item.id } })).toBeNull();
  });
});
