import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { makeCatalogEntry } from "@/test-support/catalog-entry.js";

// Manual monkeypatch, not vi.spyOn/mockRestore (used below to simulate a
// race by hijacking one Prisma delegate call): Prisma's model delegates
// don't restore cleanly through vi.spyOn's own save/restore bookkeeping —
// `mockRestore()` was observed leaving the SAME method permanently
// "not a function" for every later test in this file. Capturing the real
// bound method up front and reassigning it back in `finally` sidesteps that
// entirely.
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

  it("404s a bogus entryId", async () => {
    const res = await agent(cookieOwner)
      .post("/api/catalog/entries/does-not-exist/grants")
      .send({ campaignId: campaignA });
    expect(res.status).toBe(404);
  });

  // #1815 review finding 6: the P2002 idempotency handler used to re-fetch
  // the conflicting row with findUniqueOrThrow — if it's gone by the time
  // that re-fetch runs (a concurrent DELETE, simulated here as a side effect
  // of the mocked read), findUniqueOrThrow throws an uncaught P2025 (500).
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

  // Coordinator follow-up on finding 6: the P2002 catch's own fallback
  // `create` (reached when the re-fetch above found nothing) can ITSELF hit
  // P2002 under a double-race — a THIRD concurrent POST wins the create
  // between the null re-fetch and this fallback create. That must resolve
  // the same idempotent way, not 500. Simulated by lying "gone" on only the
  // FIRST findUnique call (the outer catch's re-fetch) while leaving the
  // real row in place — the fallback create then hits a REAL P2002 (the row
  // never actually left), and the second, unpatched findUnique call (inside
  // the new nested catch) resolves it.
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

  // #1815 review finding 9: assertGrantEntryOwnership used to check only
  // `ownerUserId === userId`, not `scope === "USER"` too. Today's CHECK
  // constraint (schema.prisma's own CatalogEntry comment) means a non-USER
  // entry never actually carries an ownerUserId, so this can't currently
  // diverge from an ownerUserId-only check — this test forces the shape
  // defensively (a real CAMPAIGN row can't have an ownerUserId) to prove the
  // CODE enforces scope independently, not merely the data happening to.
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
