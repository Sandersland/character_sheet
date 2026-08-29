import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { makeCatalogEntry } from "@/test-support/catalog-entry.js";

// Manual monkeypatch, not vi.spyOn: Prisma model delegates don't restore cleanly through vi.spyOn's save/restore, leaving the method permanently broken for later tests.
function patchMethod<T extends object, K extends keyof T>(
  target: T,
  key: K,
  replacement: T[K],
): () => void {
  const original = target[key];
  target[key] = replacement;
  return () => {
    target[key] = original;
  };
}

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

  it("404s a bogus entryId", async () => {
    const res = await agent(cookieOwner)
      .post("/api/catalog/entries/does-not-exist/grants")
      .send({ campaignId: campaignA });
    expect(res.status).toBe(404);
  });

  // The P2002 idempotency handler re-fetches the conflicting row with findUniqueOrThrow; if it's gone by then (concurrent DELETE), that throws P2025 (#1815).
  it("does not 500 when the conflicting grant is deleted between the P2002 catch and the re-fetch (concurrent DELETE race)", async () => {
    const entry = await makeOwnerSpellEntry("Racy Grant Bolt");
    const first = await agent(cookieOwner)
      .post(`/api/catalog/entries/${entry}/grants`)
      .send({ campaignId: campaignA });
    expect(first.status).toBe(201);

    const unpatch = patchMethod(
      prisma.catalogGrant,
      "findUnique",
      (async () => {
        await prisma.catalogGrant.deleteMany({ where: { catalogEntryId: entry, campaignId: campaignA } });
        return null;
      }) as unknown as typeof prisma.catalogGrant.findUnique,
    );
    try {
      const res = await agent(cookieOwner)
        .post(`/api/catalog/entries/${entry}/grants`)
        .send({ campaignId: campaignA });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ catalogEntryId: entry, campaignId: campaignA });
    } finally {
      unpatch();
    }

    const rows = await prisma.catalogGrant.findMany({ where: { catalogEntryId: entry, campaignId: campaignA } });
    expect(rows).toHaveLength(1);
  });

  // The P2002 catch's own fallback create can itself hit P2002 under a double-race — that must resolve the same idempotent way, not 500 (#1815).
  it("does not 500 on a double concurrent-create race (P2002 on both the original create and the idempotent fallback create)", async () => {
    const entry = await makeOwnerSpellEntry("Double Racy Grant Bolt");
    const first = await agent(cookieOwner)
      .post(`/api/catalog/entries/${entry}/grants`)
      .send({ campaignId: campaignA });
    expect(first.status).toBe(201);

    const originalFindUnique = prisma.catalogGrant.findUnique.bind(prisma.catalogGrant);
    let calls = 0;
    const unpatch = patchMethod(
      prisma.catalogGrant,
      "findUnique",
      (async (...args: unknown[]) => {
        calls++;
        if (calls === 1) return null;
        return (originalFindUnique as (...a: unknown[]) => unknown)(...args);
      }) as unknown as typeof prisma.catalogGrant.findUnique,
    );
    try {
      const res = await agent(cookieOwner)
        .post(`/api/catalog/entries/${entry}/grants`)
        .send({ campaignId: campaignA });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ catalogEntryId: entry, campaignId: campaignA });
    } finally {
      unpatch();
    }
    expect(calls).toBeGreaterThanOrEqual(2);

    const rows = await prisma.catalogGrant.findMany({ where: { catalogEntryId: entry, campaignId: campaignA } });
    expect(rows).toHaveLength(1);
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

  it("404s a bogus entryId", async () => {
    const res = await agent(cookieOwner).delete(`/api/catalog/entries/does-not-exist/grants/${campaignA}`);
    expect(res.status).toBe(404);
  });

  // assertGrantEntryOwnership must enforce scope === "USER" independently of ownerUserId, not rely on the CHECK constraint alone (#1815).
  it("403s a DELETE on an entry the code observes as scope !== USER, even if ownerUserId happens to match", async () => {
    const entry = await makeOwnerSpellEntry("Scope Guard Bolt");
    await agent(cookieOwner).post(`/api/catalog/entries/${entry}/grants`).send({ campaignId: campaignA });

    const unpatch = patchMethod(
      prisma.catalogEntry,
      "findUnique",
      (async () => ({ id: entry, scope: "CAMPAIGN", ownerUserId: OWNER })) as unknown as typeof prisma.catalogEntry.findUnique,
    );
    try {
      const res = await agent(cookieOwner).delete(`/api/catalog/entries/${entry}/grants/${campaignA}`);
      expect(res.status).toBe(403);
    } finally {
      unpatch();
    }

    const row = await prisma.catalogGrant.findUnique({
      where: { catalogEntryId_campaignId: { catalogEntryId: entry, campaignId: campaignA } },
    });
    expect(row).not.toBeNull();
  });
});
