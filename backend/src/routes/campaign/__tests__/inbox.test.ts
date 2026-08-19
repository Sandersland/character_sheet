import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";

const OWNER = "inbox-owner";
const MEMBER = "inbox-member";
const CHAR_OWNER = "inbox-char-owner";

async function makeCharacter(id: string, ownerId: string, campaignId?: string) {
  await prisma.character.deleteMany({ where: { id } });
  await prisma.character.create({
    data: {
      id,
      name: `Char ${id}`,
      alignment: "True Neutral",
      ownerId,
      campaignId,
      initiativeBonus: 0,
      speed: 30,
      hitPoints: { current: 10, max: 10, temp: 0 },
      hitDice: { total: 1, die: "d8" },
      abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      savingThrowProficiencies: [],
      skills: [],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
    },
  });
}

describe("GET/POST /api/inbox (#1945)", () => {
  let cookieOwner: string;
  let cookieMember: string;
  let campaignId: string;
  let memberOnlyCampaignId: string;

  async function makeEntity(campaign: string, name: string): Promise<string> {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaign}/entities`)
      .set("Cookie", cookieOwner)
      .send({ type: "NPC", name });
    return res.body.id as string;
  }

  async function mention(entityId: string, body?: string): Promise<void> {
    // NOTE (not ENTRY) so `date` defaults to today — createJournalSchema
    // requires an explicit date for ENTRY.
    const res = await supertest(app)
      .post(`/api/characters/${CHAR_OWNER}/journal`)
      .set("Cookie", cookieOwner)
      .send({ kind: "NOTE", body: body ?? `Met with @[${entityId}] today.` });
    if (res.status !== 201) throw new Error(`journal POST failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  beforeAll(async () => {
    await ensureTestOwner(OWNER);
    await ensureTestOwner(MEMBER);
    cookieOwner = await authCookie(OWNER);
    cookieMember = await authCookie(MEMBER);

    const created = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieOwner)
      .send({ name: "Inbox Campaign" });
    campaignId = created.body.id;
    await makeCharacter(CHAR_OWNER, OWNER, campaignId);
    await prisma.character.update({ where: { id: CHAR_OWNER }, data: { campaignId } });

    // A campaign the caller is only a MEMBER of — must contribute nothing.
    const other = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieMember)
      .send({ name: "Someone Else's Campaign" });
    memberOnlyCampaignId = other.body.id;
    const code = other.body.inviteCode as string;
    await supertest(app).post("/api/campaigns/join").set("Cookie", cookieOwner).send({ inviteCode: code });
  });

  afterAll(async () => {
    await prisma.inboxDismissal.deleteMany({ where: { userId: { in: [OWNER, MEMBER] } } });
    await prisma.character.deleteMany({ where: { id: CHAR_OWNER } });
    await prisma.campaign.deleteMany({ where: { id: { in: [campaignId, memberOnlyCampaignId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER, MEMBER] } } });
  });

  it("401s unauthenticated", async () => {
    const res = await supertest(app).get("/api/inbox");
    expect(res.status).toBe(401);
  });

  it("is empty with no entities", async () => {
    const res = await supertest(app).get("/api/inbox").set("Cookie", cookieOwner);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("flags a duplicate-name cluster with the most-mentioned entity as default survivor", async () => {
    const lil = await makeEntity(campaignId, "Lil");
    const lili1 = await makeEntity(campaignId, "lili");
    const lili2 = await makeEntity(campaignId, "Lili");

    await mention(lili2);
    await mention(lili2);
    await mention(lil);

    const res = await supertest(app).get("/api/inbox").set("Cookie", cookieOwner);
    expect(res.status).toBe(200);

    const cluster = res.body.find((r: { kind: string }) => r.kind === "DUPLICATE_CLUSTER");
    expect(cluster).toBeDefined();
    expect(cluster.campaignId).toBe(campaignId);
    expect(cluster.entities.map((e: { id: string }) => e.id).sort()).toEqual(
      [lil, lili1, lili2].sort(),
    );
    expect(cluster.defaultSurvivorId).toBe(lili2);

    await prisma.campaignEntity.deleteMany({ where: { id: { in: [lil, lili1, lili2] } } });
  });

  it("never flags a pair linked by a CampaignEntityMerge, even PREPARED", async () => {
    const petarus = await makeEntity(campaignId, "Petarus");
    const potaras = await makeEntity(campaignId, "Potaras");

    await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: petarus, survivorEntityId: potaras });

    const res = await supertest(app).get("/api/inbox").set("Cookie", cookieOwner);
    const clusters = res.body.filter((r: { kind: string }) => r.kind === "DUPLICATE_CLUSTER");
    const involvesPair = clusters.some((c: { entities: { id: string }[] }) =>
      c.entities.some((e) => e.id === petarus) && c.entities.some((e) => e.id === potaras),
    );
    expect(involvesPair).toBe(false);

    await prisma.campaignEntityMerge.deleteMany({ where: { mergedEntityId: petarus } });
    await prisma.campaignEntity.deleteMany({ where: { id: { in: [petarus, potaras] } } });
  });

  it("flags needs-chronicling for a mentioned entity with no description", async () => {
    const bare = await makeEntity(campaignId, "Bare Entity");
    await mention(bare);

    const res = await supertest(app).get("/api/inbox").set("Cookie", cookieOwner);
    const row = res.body.find((r: { kind: string }) => r.kind === "NEEDS_CHRONICLING");
    expect(row).toBeDefined();
    expect(row.campaignId).toBe(campaignId);
    expect(row.count).toBeGreaterThanOrEqual(1);

    await prisma.campaignEntity.deleteMany({ where: { id: bare } });
  });

  it("a campaign where the caller is a mere member contributes nothing", async () => {
    const res = await supertest(app).get("/api/inbox").set("Cookie", cookieOwner);
    const rows = res.body.filter((r: { campaignId: string }) => r.campaignId === memberOnlyCampaignId);
    expect(rows).toEqual([]);
  });

  it("dismissing a flag removes it for that user only, and it resurfaces when its signature changes", async () => {
    const lil = await makeEntity(campaignId, "Zil");
    const lili = await makeEntity(campaignId, "Zili");

    let res = await supertest(app).get("/api/inbox").set("Cookie", cookieOwner);
    let cluster = res.body.find(
      (r: { kind: string; entities: { id: string }[] }) =>
        r.kind === "DUPLICATE_CLUSTER" && r.entities.some((e) => e.id === lil),
    );
    expect(cluster).toBeDefined();
    expect(cluster.entities.map((e: { id: string }) => e.id)).toEqual(
      expect.arrayContaining([lil, lili]),
    );

    const signature: string = cluster.signature;
    const dismiss = await supertest(app)
      .post("/api/inbox/dismissals")
      .set("Cookie", cookieOwner)
      .send({ campaignId, kind: cluster.kind, signature });
    expect(dismiss.status).toBe(201);

    res = await supertest(app).get("/api/inbox").set("Cookie", cookieOwner);
    cluster = res.body.find(
      (r: { kind: string; entities: { id: string }[] }) =>
        r.kind === "DUPLICATE_CLUSTER" && r.entities.some((e) => e.id === lil),
    );
    expect(cluster).toBeUndefined();

    // Idempotent re-dismiss: same (userId, kind, signature) unique, no error.
    const redismiss = await supertest(app)
      .post("/api/inbox/dismissals")
      .set("Cookie", cookieOwner)
      .send({ campaignId, kind: "DUPLICATE_CLUSTER", signature });
    expect(redismiss.status).toBe(201);

    // A membership change (new near-duplicate joins) mints a new signature and
    // resurfaces the cluster.
    await makeEntity(campaignId, "Zila");
    res = await supertest(app).get("/api/inbox").set("Cookie", cookieOwner);
    cluster = res.body.find(
      (r: { kind: string; entities: { id: string }[] }) =>
        r.kind === "DUPLICATE_CLUSTER" && r.entities.some((e: { id: string }) => e.id === lil),
    );
    expect(cluster).toBeDefined();

    await prisma.campaignEntity.deleteMany({ where: { name: { in: ["Zil", "Zili", "Zila"] }, campaignId } });
  });

  it("a non-owner cannot dismiss a flag for a campaign they don't own", async () => {
    const res = await supertest(app)
      .post("/api/inbox/dismissals")
      .set("Cookie", cookieMember)
      .send({ campaignId, kind: "NEEDS_CHRONICLING", signature: campaignId });
    expect(res.status).toBe(403);
  });

  it("400s an invalid dismissal body", async () => {
    const res = await supertest(app)
      .post("/api/inbox/dismissals")
      .set("Cookie", cookieOwner)
      .send({ campaignId, kind: "not-a-kind", signature: "x" });
    expect(res.status).toBe(400);
  });
});
