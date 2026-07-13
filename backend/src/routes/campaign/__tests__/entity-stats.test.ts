import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";

// Unique fixture ids for this file (parallel-safe on the shared dev DB).
const OWNER = "owner-estats-owner";
const PLAYER = "owner-estats-player";
const CHAR_OWNER = "test-estats-char-owner";
const CHAR_PLAYER = "test-estats-char-player";

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

type StatsRow = {
  id: string;
  name: string;
  matchedIn?: "name" | "alias" | "notes";
  stats?: {
    mentionCount: number;
    firstMentioned: { sessionId: string | null; sessionTitle: string | null; sessionOrdinal: number | null; date: string } | null;
    lastMentioned: { sessionId: string | null; sessionTitle: string | null; sessionOrdinal: number | null; date: string } | null;
    chroniclers: string[];
    hasDescription: boolean;
  };
};

describe("entity list stats + matchedIn + backlinks session context (#839)", () => {
  let cookieOwner: string;
  let cookiePlayer: string;
  let campaignId: string;
  let sessionEarlyId: string;
  let sessionLateId: string;

  async function createEntity(body: Record<string, unknown>, cookie = cookieOwner) {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookie)
      .send(body);
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function seedEntry(opts: {
    characterId: string;
    authorUserId: string;
    body: string;
    visibility?: "PRIVATE" | "CAMPAIGN";
    date: string;
    sessionId?: string | null;
    entityIds: string[];
  }) {
    const entry = await prisma.journalEntry.create({
      data: {
        characterId: opts.characterId,
        kind: "NOTE",
        date: new Date(opts.date),
        body: opts.body,
        visibility: opts.visibility ?? "CAMPAIGN",
        authorUserId: opts.authorUserId,
        sessionId: opts.sessionId ?? null,
      },
    });
    await prisma.journalEntryRef.createMany({
      data: opts.entityIds.map((entityId) => ({ entryId: entry.id, entityId })),
    });
    return entry;
  }

  async function listWithStats(cookie: string, extra = "") {
    const res = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities?include=stats${extra}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    return res.body as StatsRow[];
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
      .send({ name: "Stats Campaign" });
    campaignId = created.body.id;
    await supertest(app)
      .post("/api/campaigns/join")
      .set("Cookie", cookiePlayer)
      .send({ inviteCode: created.body.inviteCode });

    await prisma.character.update({ where: { id: CHAR_OWNER }, data: { campaignId } });
    await prisma.character.update({ where: { id: CHAR_PLAYER }, data: { campaignId } });

    // Titles deliberately contradict startedAt order: ordinal must follow startedAt.
    const late = await prisma.session.create({
      data: {
        campaignId,
        status: "ended",
        startedAt: new Date("2026-07-05T18:00:00Z"),
        endedAt: new Date("2026-07-05T22:00:00Z"),
        title: "Session One (mislabeled)",
      },
    });
    const early = await prisma.session.create({
      data: {
        campaignId,
        status: "ended",
        startedAt: new Date("2026-06-20T18:00:00Z"),
        endedAt: new Date("2026-06-20T22:00:00Z"),
        title: "The Sunless Citadel",
      },
    });
    sessionLateId = late.id;
    sessionEarlyId = early.id;
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: { in: [CHAR_OWNER, CHAR_PLAYER] } } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER, PLAYER] } } });
  });

  it("returns bare rows without ?include=stats", async () => {
    await createEntity({ type: "NPC", name: "Bare Row NPC" });
    const res = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookieOwner);
    const row = (res.body as StatsRow[]).find((e) => e.name === "Bare Row NPC")!;
    expect(row.stats).toBeUndefined();
    expect(row.matchedIn).toBeUndefined();
  });

  it("counts per viewer: own PRIVATE counts, another member's PRIVATE never does (no DM bypass)", async () => {
    const id = await createEntity({ type: "NPC", name: "Visibility Count NPC" });
    await seedEntry({
      characterId: CHAR_OWNER,
      authorUserId: OWNER,
      body: "owner campaign note",
      visibility: "CAMPAIGN",
      date: "2026-06-21T00:00:00Z",
      entityIds: [id],
    });
    await seedEntry({
      characterId: CHAR_PLAYER,
      authorUserId: PLAYER,
      body: "player private note",
      visibility: "PRIVATE",
      date: "2026-06-25T00:00:00Z",
      entityIds: [id],
    });

    const playerRow = (await listWithStats(cookiePlayer)).find((e) => e.id === id)!;
    expect(playerRow.stats!.mentionCount).toBe(2);
    expect(playerRow.stats!.chroniclers.sort()).toEqual(
      [`Char ${CHAR_OWNER}`, `Char ${CHAR_PLAYER}`].sort(),
    );

    const ownerRow = (await listWithStats(cookieOwner)).find((e) => e.id === id)!;
    expect(ownerRow.stats!.mentionCount).toBe(1);
    expect(ownerRow.stats!.chroniclers).toEqual([`Char ${CHAR_OWNER}`]);
  });

  it("derives session ordinal from startedAt order, not title", async () => {
    const id = await createEntity({ type: "LOCATION", name: "Ordinal Keep" });
    await seedEntry({
      characterId: CHAR_OWNER,
      authorUserId: OWNER,
      body: "first visit",
      date: "2026-06-20T20:00:00Z",
      sessionId: sessionEarlyId,
      entityIds: [id],
    });
    await seedEntry({
      characterId: CHAR_OWNER,
      authorUserId: OWNER,
      body: "second visit",
      date: "2026-07-05T20:00:00Z",
      sessionId: sessionLateId,
      entityIds: [id],
    });

    const row = (await listWithStats(cookieOwner)).find((e) => e.id === id)!;
    expect(row.stats!.firstMentioned).toMatchObject({
      sessionId: sessionEarlyId,
      sessionTitle: "The Sunless Citadel",
      sessionOrdinal: 1,
    });
    expect(row.stats!.lastMentioned).toMatchObject({
      sessionId: sessionLateId,
      sessionTitle: "Session One (mislabeled)",
      sessionOrdinal: 2,
    });
  });

  it("null session context for a session-less mention, null first/last for no mentions", async () => {
    const mentioned = await createEntity({ type: "NPC", name: "Sessionless NPC" });
    const unmentioned = await createEntity({ type: "NPC", name: "Unmentioned NPC" });
    await seedEntry({
      characterId: CHAR_OWNER,
      authorUserId: OWNER,
      body: "downtime note",
      date: "2026-06-23T00:00:00Z",
      entityIds: [mentioned],
    });

    const rows = await listWithStats(cookieOwner);
    const withMention = rows.find((e) => e.id === mentioned)!;
    expect(withMention.stats!.firstMentioned).toMatchObject({
      sessionId: null,
      sessionTitle: null,
      sessionOrdinal: null,
    });
    const bare = rows.find((e) => e.id === unmentioned)!;
    expect(bare.stats!.mentionCount).toBe(0);
    expect(bare.stats!.firstMentioned).toBeNull();
    expect(bare.stats!.lastMentioned).toBeNull();
    expect(bare.stats!.chroniclers).toEqual([]);
  });

  it("counts merge-union refs once, even when an entry dual-tags identity and survivor", async () => {
    const survivor = await createEntity({ type: "NPC", name: "Union Survivor" });
    const merged = await createEntity({ type: "NPC", name: "Union Old Identity" });
    const prepared = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: merged, survivorEntityId: survivor });
    await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges/${prepared.body.id}/execute`)
      .set("Cookie", cookieOwner);

    await seedEntry({
      characterId: CHAR_OWNER,
      authorUserId: OWNER,
      body: "tags both identities",
      date: "2026-06-24T00:00:00Z",
      entityIds: [survivor, merged],
    });
    await seedEntry({
      characterId: CHAR_OWNER,
      authorUserId: OWNER,
      body: "tags only the old identity",
      date: "2026-06-26T00:00:00Z",
      entityIds: [merged],
    });

    const rows = await listWithStats(cookieOwner);
    expect(rows.find((e) => e.id === survivor)!.stats!.mentionCount).toBe(2);
    expect(rows.find((e) => e.id === merged)!.stats!.mentionCount).toBe(2);
  });

  it("excludes a HIDDEN merged identity's refs from a member's stats but not the owner's", async () => {
    const survivor = await createEntity({ type: "NPC", name: "Scrub Survivor" });
    const hidden = await createEntity({ type: "NPC", name: "Scrub Hidden", visibility: "HIDDEN" });
    const prepared = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: hidden, survivorEntityId: survivor });
    await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges/${prepared.body.id}/execute`)
      .set("Cookie", cookieOwner);
    // Executing revealed the survivor; re-hide the merged identity's row stays HIDDEN.

    await seedEntry({
      characterId: CHAR_OWNER,
      authorUserId: OWNER,
      body: "tags the hidden old identity",
      date: "2026-06-27T00:00:00Z",
      entityIds: [hidden],
    });

    const memberRows = await listWithStats(cookiePlayer);
    expect(memberRows.some((e) => e.id === hidden)).toBe(false);
    expect(memberRows.find((e) => e.id === survivor)!.stats!.mentionCount).toBe(0);

    const ownerRows = await listWithStats(cookieOwner);
    expect(ownerRows.find((e) => e.id === survivor)!.stats!.mentionCount).toBe(1);
  });

  it("marks matchedIn with name > alias > notes precedence and matches notes text", async () => {
    await createEntity({
      type: "NPC",
      name: "Leosin Erlanthar",
      aliases: ["The Monk"],
      notes: "A harper agent held by the cult",
    });
    await createEntity({
      type: "NPC",
      name: "Cult Guard",
      aliases: [],
      notes: "Watches Leosin day and night",
    });

    const byName = await listWithStats(cookieOwner, "&q=leosin");
    expect(byName.find((e) => e.name === "Leosin Erlanthar")!.matchedIn).toBe("name");
    expect(byName.find((e) => e.name === "Cult Guard")!.matchedIn).toBe("notes");

    const byAlias = await listWithStats(cookieOwner, "&q=monk");
    expect(byAlias.find((e) => e.name === "Leosin Erlanthar")!.matchedIn).toBe("alias");

    const byNotes = await listWithStats(cookieOwner, "&q=harper");
    expect(byNotes.find((e) => e.name === "Leosin Erlanthar")!.matchedIn).toBe("notes");
    expect(byNotes.some((e) => e.name === "Cult Guard")).toBe(false);
  });

  it("flags hasDescription from trimmed notes", async () => {
    const withNotes = await createEntity({ type: "OTHER", name: "Described", notes: "  lore  " });
    const blankNotes = await createEntity({ type: "OTHER", name: "Blank Notes", notes: "   " });
    const noNotes = await createEntity({ type: "OTHER", name: "No Notes" });

    const rows = await listWithStats(cookieOwner);
    expect(rows.find((e) => e.id === withNotes)!.stats!.hasDescription).toBe(true);
    expect(rows.find((e) => e.id === blankNotes)!.stats!.hasDescription).toBe(false);
    expect(rows.find((e) => e.id === noNotes)!.stats!.hasDescription).toBe(false);
  });

  it("backlinks entries carry sessionTitle/sessionOrdinal, null for session-less entries", async () => {
    const id = await createEntity({ type: "NPC", name: "Backlink Session NPC" });
    await seedEntry({
      characterId: CHAR_OWNER,
      authorUserId: OWNER,
      body: "in-session backlink",
      date: "2026-07-05T21:00:00Z",
      sessionId: sessionLateId,
      entityIds: [id],
    });
    await seedEntry({
      characterId: CHAR_OWNER,
      authorUserId: OWNER,
      body: "downtime backlink",
      date: "2026-07-06T00:00:00Z",
      entityIds: [id],
    });

    const res = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/${id}/backlinks`)
      .set("Cookie", cookieOwner);
    expect(res.status).toBe(200);
    const entries = (res.body as { entry: { body: string; sessionId: string | null; sessionTitle: string | null; sessionOrdinal: number | null } }[]).map((b) => b.entry);
    const inSession = entries.find((e) => e.body === "in-session backlink")!;
    expect(inSession.sessionId).toBe(sessionLateId);
    expect(inSession.sessionTitle).toBe("Session One (mislabeled)");
    expect(inSession.sessionOrdinal).toBe(2);
    const downtime = entries.find((e) => e.body === "downtime backlink")!;
    expect(downtime.sessionId).toBeNull();
    expect(downtime.sessionTitle).toBeNull();
    expect(downtime.sessionOrdinal).toBeNull();
  });
});
