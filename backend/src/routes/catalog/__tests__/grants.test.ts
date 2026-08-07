import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { makeCatalogEntry } from "@/test-support/catalog-entry.js";

// Grant CRUD (#1799, epic #1795 4/6): share a USER-scope homebrew CatalogEntry
// into a campaign the owner belongs to. Real Postgres, supertest against the
// shared `app`. Fixtures: OWNER owns campaignA (auto-member) and a homebrew
// catalog entry; OUTSIDER joins campaignA (a non-owner member) but also owns
// campaignC, which OWNER never joins (the owner-not-a-member case).

const OWNER = "owner-grants-owner";
const OUTSIDER = "owner-grants-outsider";

let cookieOwner: string;
let cookieOutsider: string;
let campaignA: string;
let campaignC: string;

const agent = (cookie: string) => supertest.agent(app).set("Cookie", cookie);

async function makeOwnerSpellEntry(name: string): Promise<string> {
  return makeCatalogEntry({ scope: "USER", ownerUserId: OWNER, name });
}

beforeAll(async () => {
  await ensureTestOwner(OWNER);
  await ensureTestOwner(OUTSIDER);
  cookieOwner = await authCookie(OWNER);
  cookieOutsider = await authCookie(OUTSIDER);

  const createdA = await agent(cookieOwner).post("/api/campaigns").send({ name: "Grants Campaign A" });
  campaignA = createdA.body.id;
  await agent(cookieOutsider).post("/api/campaigns/join").send({ inviteCode: createdA.body.inviteCode });

  const createdC = await agent(cookieOutsider).post("/api/campaigns").send({ name: "Grants Campaign C" });
  campaignC = createdC.body.id;
});

afterAll(async () => {
  await prisma.campaign.deleteMany({ where: { id: { in: [campaignA, campaignC] } } });
  await prisma.user.deleteMany({ where: { id: { in: [OWNER, OUTSIDER] } } });
});

describe("POST /api/catalog/entries/:entryId/grants", () => {
  it("lets the entry owner, a member of the campaign, create a grant", async () => {
    const entry = await makeOwnerSpellEntry("Grantable Bolt");

    const res = await agent(cookieOwner)
      .post(`/api/catalog/entries/${entry}/grants`)
      .send({ campaignId: campaignA });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ catalogEntryId: entry, campaignId: campaignA });

    const row = await prisma.catalogGrant.findUnique({
      where: { catalogEntryId_campaignId: { catalogEntryId: entry, campaignId: campaignA } },
    });
    expect(row).not.toBeNull();
  });

  it("is idempotent on the unique key: a second identical grant is not a 500", async () => {
    const entry = await makeOwnerSpellEntry("Repeatable Bolt");

    const first = await agent(cookieOwner)
      .post(`/api/catalog/entries/${entry}/grants`)
      .send({ campaignId: campaignA });
    expect(first.status).toBe(201);

    const second = await agent(cookieOwner)
      .post(`/api/catalog/entries/${entry}/grants`)
      .send({ campaignId: campaignA });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ catalogEntryId: entry, campaignId: campaignA });

    const rows = await prisma.catalogGrant.findMany({ where: { catalogEntryId: entry, campaignId: campaignA } });
    expect(rows).toHaveLength(1);
  });

  it("403s a non-owner's grant attempt", async () => {
    const entry = await makeOwnerSpellEntry("Not Yours Bolt");

    const res = await agent(cookieOutsider)
      .post(`/api/catalog/entries/${entry}/grants`)
      .send({ campaignId: campaignA });
    expect(res.status).toBe(403);
  });

  it("403s an owner who is not a member of the target campaign", async () => {
    const entry = await makeOwnerSpellEntry("Wrong Table Bolt");

    const res = await agent(cookieOwner)
      .post(`/api/catalog/entries/${entry}/grants`)
      .send({ campaignId: campaignC });
    expect(res.status).toBe(403);
  });

  it("400s granting a GLOBAL entry (only USER entries are grantable)", async () => {
    const entry = await makeCatalogEntry({ scope: "GLOBAL", name: "Seeded Global Bolt" });

    const res = await agent(cookieOwner)
      .post(`/api/catalog/entries/${entry}/grants`)
      .send({ campaignId: campaignA });
    expect(res.status).toBe(400);
  });

  it("400s granting a CAMPAIGN entry (only USER entries are grantable)", async () => {
    const entry = await makeCatalogEntry({ scope: "CAMPAIGN", ownerCampaignId: campaignA, name: "DM Homebrew Bolt" });

    const res = await agent(cookieOwner)
      .post(`/api/catalog/entries/${entry}/grants`)
      .send({ campaignId: campaignA });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/catalog/entries/:entryId/grants/:campaignId", () => {
  it("lets the owner revoke a grant, removing visibility", async () => {
    const entry = await makeOwnerSpellEntry("Revocable Bolt");
    await agent(cookieOwner).post(`/api/catalog/entries/${entry}/grants`).send({ campaignId: campaignA });

    const res = await agent(cookieOwner).delete(`/api/catalog/entries/${entry}/grants/${campaignA}`);
    expect(res.status).toBe(204);

    const row = await prisma.catalogGrant.findUnique({
      where: { catalogEntryId_campaignId: { catalogEntryId: entry, campaignId: campaignA } },
    });
    expect(row).toBeNull();
  });

  it("403s a non-owner's revoke attempt", async () => {
    const entry = await makeOwnerSpellEntry("Guarded Bolt");
    await agent(cookieOwner).post(`/api/catalog/entries/${entry}/grants`).send({ campaignId: campaignA });

    const res = await agent(cookieOutsider).delete(`/api/catalog/entries/${entry}/grants/${campaignA}`);
    expect(res.status).toBe(403);

    const row = await prisma.catalogGrant.findUnique({
      where: { catalogEntryId_campaignId: { catalogEntryId: entry, campaignId: campaignA } },
    });
    expect(row).not.toBeNull();
  });
});
