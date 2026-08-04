// #1646: merging CampaignItem into Item put every item in a campaign under one
// scopeKey, so Item's @@unique([scopeKey, name]) now forbids two same-named
// items in a campaign — CampaignItem had no such constraint. That rule is
// intentional (two identically-named items are indistinguishable in the DM's
// list), but it has to surface as a 409 the UI can render.
//
// The raw Prisma error must never reach the client: it embeds the absolute
// server path and the failing query text, which is why these assert on the
// message body and not only the status.
//
// The mapping lives in the central errorHandler beside its P2025 -> 404 twin,
// so it covers every route rather than these two — which is also why the
// message is generic and these tests do not assert the item's name.
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";

const OWNER_ID = "owner-campaign-item-duplicate-name";
let COOKIE: string;
let campaignId: string;
let otherCampaignId: string;

async function createItem(inCampaign: string, name: string) {
  return supertest
    .agent(app)
    .set("Cookie", COOKIE)
    .post(`/api/campaigns/${inCampaign}/items`)
    .send({ name, category: "gear" });
}

async function makeCampaign(name: string) {
  const campaign = await prisma.campaign.create({
    data: { name, ownerId: OWNER_ID, inviteCode: randomUUID(), members: { create: { userId: OWNER_ID, role: "OWNER" } } },
  });
  return campaign.id;
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  campaignId = await makeCampaign("Duplicate Name Campaign");
  otherCampaignId = await makeCampaign("Duplicate Name Other Campaign");
});

afterAll(async () => {
  await prisma.campaign.deleteMany({ where: { id: { in: [campaignId, otherCampaignId] } } });
});

describe("duplicate campaign item names (#1646)", () => {
  it("rejects a second item with the same name in the same campaign as 409", async () => {
    expect((await createItem(campaignId, "Potion of Healing")).status).toBe(201);

    const second = await createItem(campaignId, "Potion of Healing");

    expect(second.status).toBe(409);
    expect(second.body.error).toBe("That already exists");
  });

  it("never leaks the Prisma error, the server path, or the query text", async () => {
    await createItem(campaignId, "Leak Probe");
    const second = await createItem(campaignId, "Leak Probe");

    const serialized = JSON.stringify(second.body);
    expect(serialized).not.toContain("Invalid `");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("scopeKey");
  });

  it("still allows the same name in a DIFFERENT campaign", async () => {
    expect((await createItem(campaignId, "Shared Name Blade")).status).toBe(201);
    expect((await createItem(otherCampaignId, "Shared Name Blade")).status).toBe(201);
  });

  it("rejects a RENAME onto an existing name as 409", async () => {
    expect((await createItem(campaignId, "Rename Source")).status).toBe(201);
    const target = await createItem(campaignId, "Rename Target");
    expect(target.status).toBe(201);

    const renamed = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .patch(`/api/campaigns/${campaignId}/items/${target.body.id}`)
      .send({ name: "Rename Source" });

    expect(renamed.status).toBe(409);
    expect(renamed.body.error).toBe("That already exists");
  });
});
