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

  async function mention(entityId: string, body?: string, date?: string): Promise<void> {
    // NOTE (not ENTRY) so `date` defaults to today — createJournalSchema
    // requires an explicit date for ENTRY.
    const res = await supertest(app)
      .post(`/api/characters/${CHAR_OWNER}/journal`)
      .set("Cookie", cookieOwner)
      .send({ kind: "NOTE", body: body ?? `Met with @[${entityId}] today.`, date });
    if (res.status !== 201) throw new Error(`journal POST failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  async function mergeExecuted(mergedEntityId: string, survivorEntityId: string): Promise<void> {
    const prep = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId, survivorEntityId });
    const exec = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges/${prep.body.id}/execute`)
      .set("Cookie", cookieOwner);
    if (exec.status !== 200) throw new Error(`merge execute failed: ${exec.status} ${JSON.stringify(exec.body)}`);
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
    expect(typeof cluster.signalAt).toBe("string");
    expect(Number.isNaN(Date.parse(cluster.signalAt))).toBe(false);

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
    expect(typeof row.signalAt).toBe("string");
    expect(Number.isNaN(Date.parse(row.signalAt))).toBe(false);

    await prisma.campaignEntity.deleteMany({ where: { id: bare } });
  });

  it("serializes signalAt on every row, and orders rows newest-signal-first (#1946)", async () => {
    const oldEntity = await makeEntity(campaignId, "Ancient Note Subject");
    const newEntity = await makeEntity(campaignId, "Fresh Note Subject");
    await mention(oldEntity, `Old note about @[${oldEntity}].`, "2020-01-01");
    await mention(newEntity, `Fresh note about @[${newEntity}].`);

    const res = await supertest(app).get("/api/inbox").set("Cookie", cookieOwner);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);

    for (const row of res.body as { signalAt: string }[]) {
      expect(typeof row.signalAt).toBe("string");
      expect(Number.isNaN(Date.parse(row.signalAt))).toBe(false);
    }
    const times = (res.body as { signalAt: string }[]).map((r) => Date.parse(r.signalAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));

    // Both entities are mentioned + undescribed, so needs-chronicling flags
    // both; its signalAt is the MAX across them (today's mention), not
    // pinned to the 2020 one — proves signalAt reflects the real sort key.
    const chronicling = res.body.find(
      (r: { kind: string }) => r.kind === "NEEDS_CHRONICLING",
    ) as { signalAt: string } | undefined;
    expect(chronicling).toBeDefined();
    expect(Date.parse(chronicling!.signalAt)).toBeGreaterThan(Date.parse("2020-06-01"));

    await prisma.campaignEntity.deleteMany({ where: { id: { in: [oldEntity, newEntity] } } });
  });

  it("never clusters a Guard 1/Guard 2/Guard 3 naming scheme (#1945 review)", async () => {
    const g1 = await makeEntity(campaignId, "Guard 1");
    const g2 = await makeEntity(campaignId, "Guard 2");
    const g3 = await makeEntity(campaignId, "Guard 3");

    const res = await supertest(app).get("/api/inbox").set("Cookie", cookieOwner);
    const clusters = res.body.filter((r: { kind: string }) => r.kind === "DUPLICATE_CLUSTER");
    const involvesAny = clusters.some((c: { entities: { id: string }[] }) =>
      c.entities.some((e) => [g1, g2, g3].includes(e.id)),
    );
    expect(involvesAny).toBe(false);

    await prisma.campaignEntity.deleteMany({ where: { id: { in: [g1, g2, g3] } } });
  });

  it("attributes a merged-away identity's mentions to its survivor before picking the default (#1945 review)", async () => {
    const oldRook = await makeEntity(campaignId, "Old Rook");
    const captainRook = await makeEntity(campaignId, "Captain Rook");
    const captainRok = await makeEntity(campaignId, "Captain Rok");

    // Old Rook accrues 3 mentions of its own, THEN gets identity-merged into
    // Captain Rook — those 3 must attribute to Captain Rook, not vanish.
    await mention(oldRook, `Notes about @[${oldRook}], part one.`);
    await mention(oldRook, `Notes about @[${oldRook}], part two.`);
    await mention(oldRook, `Notes about @[${oldRook}], part three.`);
    // Captain Rook: 1 direct mention. Captain Rok (typo): 2 direct mentions —
    // MORE than Captain Rook's own direct count, so without attribution the
    // typo would wrongly win pickDefaultSurvivor.
    await mention(captainRook, `About @[${captainRook}].`);
    await mention(captainRok, `About @[${captainRok}], first.`);
    await mention(captainRok, `About @[${captainRok}], second.`);

    await mergeExecuted(oldRook, captainRook);

    const res = await supertest(app).get("/api/inbox").set("Cookie", cookieOwner);
    const cluster = res.body.find(
      (r: { kind: string; entities: { id: string }[] }) =>
        r.kind === "DUPLICATE_CLUSTER" && r.entities.some((e) => e.id === captainRook),
    );
    expect(cluster).toBeDefined();
    expect(cluster.defaultSurvivorId).toBe(captainRook);
    const survivorEntity = cluster.entities.find((e: { id: string }) => e.id === captainRook);
    // 1 direct + 3 attributed from the merged-away Old Rook.
    expect(survivorEntity.mentionCount).toBe(4);

    await prisma.campaignEntityMerge.deleteMany({ where: { mergedEntityId: oldRook } });
    await prisma.campaignEntity.deleteMany({ where: { id: { in: [oldRook, captainRook, captainRok] } } });
  });

  it("removes an EXECUTED-merged-away entity from clustering entirely, even against an unrelated near-duplicate (#1945 review)", async () => {
    const lili = await makeEntity(campaignId, "Lili");
    const concierge = await makeEntity(campaignId, "The Concierge"); // unrelated name, the survivor
    const lily = await makeEntity(campaignId, "Lily"); // near-dup of "Lili" by distance, NOT itself merge-linked

    await mergeExecuted(lili, concierge);

    const res = await supertest(app).get("/api/inbox").set("Cookie", cookieOwner);
    const clusters = res.body.filter((r: { kind: string }) => r.kind === "DUPLICATE_CLUSTER");
    const involvesLili = clusters.some((c: { entities: { id: string }[] }) =>
      c.entities.some((e) => e.id === lili),
    );
    expect(involvesLili).toBe(false);
    // Lily's only near-duplicate partner (Lili) is gone, so Lily forms no
    // cluster either — pairwise exclusion alone would have missed this,
    // since Lili/Lily were never themselves a merge pair.
    const involvesLily = clusters.some((c: { entities: { id: string }[] }) =>
      c.entities.some((e) => e.id === lily),
    );
    expect(involvesLily).toBe(false);

    await prisma.campaignEntityMerge.deleteMany({ where: { mergedEntityId: lili } });
    await prisma.campaignEntity.deleteMany({ where: { id: { in: [lili, concierge, lily] } } });
  });

  it("removes every entity along a transitive EXECUTED merge chain (A->B->C) from clustering (#1945 review)", async () => {
    const jenkins = await makeEntity(campaignId, "Jenkins");
    const vecna = await makeEntity(campaignId, "Vecna");
    const whispered = await makeEntity(campaignId, "Whispered One");
    const jankins = await makeEntity(campaignId, "Jankins"); // near-dup of Jenkins (chain link A)
    const vecra = await makeEntity(campaignId, "Vecra"); // near-dup of Vecna (chain link B)

    await mergeExecuted(jenkins, vecna);
    await mergeExecuted(vecna, whispered);

    const res = await supertest(app).get("/api/inbox").set("Cookie", cookieOwner);
    const clusters = res.body.filter((r: { kind: string }) => r.kind === "DUPLICATE_CLUSTER");
    const involvesEitherChainLink = clusters.some((c: { entities: { id: string }[] }) =>
      c.entities.some((e) => e.id === jenkins || e.id === vecna),
    );
    expect(involvesEitherChainLink).toBe(false);

    await prisma.campaignEntityMerge.deleteMany({ where: { mergedEntityId: { in: [jenkins, vecna] } } });
    await prisma.campaignEntity.deleteMany({
      where: { id: { in: [jenkins, vecna, whispered, jankins, vecra] } },
    });
  });

  it("needs-chronicling resurfaces after dismissal when a new undescribed mention joins the flagged set (#1945 review)", async () => {
    const first = await makeEntity(campaignId, "Chronicle Subject One");
    await mention(first);

    let res = await supertest(app).get("/api/inbox").set("Cookie", cookieOwner);
    let row = res.body.find((r: { kind: string }) => r.kind === "NEEDS_CHRONICLING");
    expect(row).toBeDefined();

    const dismiss = await supertest(app)
      .post("/api/inbox/dismissals")
      .set("Cookie", cookieOwner)
      .send({ campaignId, kind: "NEEDS_CHRONICLING", signature: row.signature });
    expect(dismiss.status).toBe(201);

    res = await supertest(app).get("/api/inbox").set("Cookie", cookieOwner);
    row = res.body.find((r: { kind: string }) => r.kind === "NEEDS_CHRONICLING");
    expect(row).toBeUndefined();

    const second = await makeEntity(campaignId, "Chronicle Subject Two");
    await mention(second);

    res = await supertest(app).get("/api/inbox").set("Cookie", cookieOwner);
    row = res.body.find((r: { kind: string }) => r.kind === "NEEDS_CHRONICLING");
    expect(row).toBeDefined();
    expect(row.count).toBe(2);

    await prisma.campaignEntity.deleteMany({ where: { id: { in: [first, second] } } });
  });

  it("400s a dismissal whose signature's entities don't belong to campaignId (#1945 review)", async () => {
    const other = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieOwner)
      .send({ name: "Owner's Other Campaign" });
    const otherCampaignId = other.body.id as string;
    const otherChar = "inbox-cross-campaign-char";
    await makeCharacter(otherChar, OWNER, otherCampaignId);

    const entityId = await makeEntity(otherCampaignId, "Cross Campaign Subject");
    const journalRes = await supertest(app)
      .post(`/api/characters/${otherChar}/journal`)
      .set("Cookie", cookieOwner)
      .send({ kind: "NOTE", body: `About @[${entityId}].` });
    expect(journalRes.status).toBe(201);

    const res = await supertest(app).get("/api/inbox").set("Cookie", cookieOwner);
    const row = res.body.find(
      (r: { kind: string; campaignId: string }) =>
        r.kind === "NEEDS_CHRONICLING" && r.campaignId === otherCampaignId,
    );
    expect(row).toBeDefined();

    // The signature is real (belongs to otherCampaignId's flagged entity) but
    // the request claims it belongs to campaignId (A) instead.
    const dismiss = await supertest(app)
      .post("/api/inbox/dismissals")
      .set("Cookie", cookieOwner)
      .send({ campaignId, kind: "NEEDS_CHRONICLING", signature: row.signature });
    expect(dismiss.status).toBe(400);

    await prisma.character.deleteMany({ where: { id: otherChar } });
    await prisma.campaign.deleteMany({ where: { id: otherCampaignId } });
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
