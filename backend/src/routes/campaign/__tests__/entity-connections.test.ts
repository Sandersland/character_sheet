import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";

// Unique fixture ids for this file (parallel-safe on the shared dev DB).
const OWNER = "owner-econn-owner";
const PLAYER = "owner-econn-player";
const CHAR_OWNER = "test-econn-char-owner";
const CHAR_PLAYER = "test-econn-char-player";

const app = createApp();

async function makeCharacter(id: string, ownerId: string) {
  await prisma.character.deleteMany({ where: { id } });
  await prisma.character.create({
    data: {
      id,
      name: `Char ${id}`,
      alignment: "True Neutral",
      ownerId,
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

type Connection = { entity: { id: string; name: string; type: string }; count: number };

describe("entity connections (#839)", () => {
  let cookieOwner: string;
  let cookiePlayer: string;
  let campaignId: string;
  let leosin: string;
  let cultB: string;
  let monasteryC: string;
  let hiddenD: string;

  async function createEntity(body: Record<string, unknown>) {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookieOwner)
      .send(body);
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function seedEntry(opts: {
    characterId: string;
    authorUserId: string;
    body: string;
    visibility?: "PRIVATE" | "CAMPAIGN";
    entityIds: string[];
  }) {
    const entry = await prisma.journalEntry.create({
      data: {
        characterId: opts.characterId,
        kind: "NOTE",
        date: new Date("2026-07-01T00:00:00Z"),
        body: opts.body,
        visibility: opts.visibility ?? "CAMPAIGN",
        authorUserId: opts.authorUserId,
      },
    });
    await prisma.journalEntryRef.createMany({
      data: opts.entityIds.map((entityId) => ({ entryId: entry.id, entityId })),
    });
  }

  async function connectionsFor(entityId: string, cookie: string, extra = "") {
    const res = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/${entityId}/connections${extra}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    return res.body as Connection[];
  }

  beforeAll(async () => {
    await ensureTestOwner(OWNER);
    await ensureTestOwner(PLAYER);
    cookieOwner = await authCookie(OWNER);
    cookiePlayer = await authCookie(PLAYER);
    await makeCharacter(CHAR_OWNER, OWNER);
    await makeCharacter(CHAR_PLAYER, PLAYER);

    const created = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieOwner)
      .send({ name: "Connections Campaign" });
    campaignId = created.body.id;
    await supertest(app)
      .post("/api/campaigns/join")
      .set("Cookie", cookiePlayer)
      .send({ inviteCode: created.body.inviteCode });
    await prisma.character.update({ where: { id: CHAR_OWNER }, data: { campaignId } });
    await prisma.character.update({ where: { id: CHAR_PLAYER }, data: { campaignId } });

    leosin = await createEntity({ type: "NPC", name: "Leosin Erlanthar" });
    cultB = await createEntity({ type: "FACTION", name: "Cult of the Dragon" });
    monasteryC = await createEntity({ type: "LOCATION", name: "Candlekeep Monastery" });
    hiddenD = await createEntity({ type: "NPC", name: "Secret Patron", visibility: "HIDDEN" });

    // B co-mentioned with Leosin x3, C x1, hidden D x1.
    await seedEntry({ characterId: CHAR_OWNER, authorUserId: OWNER, body: "co 1", entityIds: [leosin, cultB] });
    await seedEntry({ characterId: CHAR_OWNER, authorUserId: OWNER, body: "co 2", entityIds: [leosin, cultB] });
    await seedEntry({ characterId: CHAR_PLAYER, authorUserId: PLAYER, body: "co 3", entityIds: [leosin, cultB, monasteryC] });
    await seedEntry({ characterId: CHAR_OWNER, authorUserId: OWNER, body: "co hidden", entityIds: [leosin, hiddenD] });
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: { in: [CHAR_OWNER, CHAR_PLAYER] } } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER, PLAYER] } } });
  });

  it("returns co-mentioned entities sorted desc by distinct-entry count", async () => {
    const conns = await connectionsFor(leosin, cookiePlayer);
    const ids = conns.map((c) => c.entity.id);
    expect(ids.indexOf(cultB)).toBeLessThan(ids.indexOf(monasteryC));
    expect(conns.find((c) => c.entity.id === cultB)!.count).toBe(3);
    expect(conns.find((c) => c.entity.id === monasteryC)!.count).toBe(1);
    expect(conns.every((c) => c.entity.id !== leosin)).toBe(true);
  });

  it("omits a HIDDEN co-mention for a member but shows it to the owner", async () => {
    const member = await connectionsFor(leosin, cookiePlayer);
    expect(member.some((c) => c.entity.id === hiddenD)).toBe(false);

    const owner = await connectionsFor(leosin, cookieOwner);
    expect(owner.find((c) => c.entity.id === hiddenD)!.count).toBe(1);
  });

  it("ignores another member's PRIVATE entry entirely", async () => {
    const secret = await createEntity({ type: "NPC", name: "Private Contact" });
    await seedEntry({
      characterId: CHAR_PLAYER,
      authorUserId: PLAYER,
      body: "private co-mention",
      visibility: "PRIVATE",
      entityIds: [leosin, secret],
    });

    // Invisible to the owner (no DM bypass) but present for its author.
    const owner = await connectionsFor(leosin, cookieOwner);
    expect(owner.some((c) => c.entity.id === secret)).toBe(false);
    const author = await connectionsFor(leosin, cookiePlayer);
    expect(author.find((c) => c.entity.id === secret)!.count).toBe(1);
  });

  it("attributes a merged-identity co-mention to its survivor, counting a dual-tag once", async () => {
    const survivor = await createEntity({ type: "NPC", name: "True Identity" });
    const oldId = await createEntity({ type: "NPC", name: "Old Identity" });
    const prepared = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: oldId, survivorEntityId: survivor });
    await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges/${prepared.body.id}/execute`)
      .set("Cookie", cookieOwner);

    // One entry tags Leosin + old identity, one dual-tags old identity AND survivor.
    await seedEntry({ characterId: CHAR_OWNER, authorUserId: OWNER, body: "old co", entityIds: [leosin, oldId] });
    await seedEntry({ characterId: CHAR_OWNER, authorUserId: OWNER, body: "dual co", entityIds: [leosin, oldId, survivor] });

    const conns = await connectionsFor(leosin, cookieOwner);
    expect(conns.find((c) => c.entity.id === survivor)!.count).toBe(2);
    expect(conns.some((c) => c.entity.id === oldId)).toBe(false);
  });

  it("respects ?limit=", async () => {
    const conns = await connectionsFor(leosin, cookieOwner, "?limit=1");
    expect(conns).toHaveLength(1);
    expect(conns[0].entity.id).toBe(cultB);
  });

  it("404s a non-owner asking for a HIDDEN target's connections", async () => {
    const member = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/${hiddenD}/connections`)
      .set("Cookie", cookiePlayer);
    expect(member.status).toBe(404);

    const owner = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/${hiddenD}/connections`)
      .set("Cookie", cookieOwner);
    expect(owner.status).toBe(200);
  });
});
