import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";

// Unique fixture ids for this file (parallel-safe on the shared dev DB).
const OWNER = "owner-eact-owner";
const PLAYER = "owner-eact-player";
const CHAR_OWNER = "test-eact-char-owner";
const CHAR_PLAYER = "test-eact-char-player";

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

type ActivityItem =
  | {
      kind: "mention";
      characterName: string;
      entity: { id: string; name: string; type: string };
      sessionOrdinal: number | null;
      date: string;
    }
  | { kind: "created"; entity: { id: string; name: string; type: string }; date: string };

describe("entity activity feed (#839)", () => {
  let cookieOwner: string;
  let cookiePlayer: string;
  let campaignId: string;
  let sessionId: string;
  let entityA: string;
  let entityB: string;
  let hiddenH: string;

  async function makeEntity(
    name: string,
    createdAt: string,
    visibility: "HIDDEN" | "REVEALED" = "REVEALED",
  ) {
    const entity = await prisma.campaignEntity.create({
      data: { campaignId, type: "NPC", name, visibility, createdAt: new Date(createdAt) },
    });
    return entity.id;
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
  }

  async function feedFor(cookie: string, extra = "") {
    const res = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/activity${extra}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    return res.body as ActivityItem[];
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
      .send({ name: "Activity Campaign" });
    campaignId = created.body.id;
    await supertest(app)
      .post("/api/campaigns/join")
      .set("Cookie", cookiePlayer)
      .send({ inviteCode: created.body.inviteCode });
    await prisma.character.update({ where: { id: CHAR_OWNER }, data: { campaignId } });
    await prisma.character.update({ where: { id: CHAR_PLAYER }, data: { campaignId } });

    const session = await prisma.session.create({
      data: {
        campaignId,
        status: "ended",
        startedAt: new Date("2026-07-04T18:00:00Z"),
        endedAt: new Date("2026-07-04T22:00:00Z"),
      },
    });
    sessionId = session.id;

    entityB = await makeEntity("Feed Entity B", "2026-06-15T00:00:00Z");
    entityA = await makeEntity("Feed Entity A", "2026-07-02T00:00:00Z");
    hiddenH = await makeEntity("Feed Hidden H", "2026-07-03T00:00:00Z", "HIDDEN");

    await seedEntry({
      characterId: CHAR_OWNER,
      authorUserId: OWNER,
      body: "session mention of A",
      date: "2026-07-04T20:00:00Z",
      sessionId,
      entityIds: [entityA],
    });
    await seedEntry({
      characterId: CHAR_PLAYER,
      authorUserId: PLAYER,
      body: "private mention of A",
      visibility: "PRIVATE",
      date: "2026-07-05T00:00:00Z",
      entityIds: [entityA],
    });
    await seedEntry({
      characterId: CHAR_OWNER,
      authorUserId: OWNER,
      body: "mention of hidden H",
      date: "2026-07-06T00:00:00Z",
      entityIds: [hiddenH],
    });
    await seedEntry({
      characterId: CHAR_OWNER,
      authorUserId: OWNER,
      body: "downtime mention of B",
      date: "2026-06-18T00:00:00Z",
      entityIds: [entityB],
    });
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: { in: [CHAR_OWNER, CHAR_PLAYER] } } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER, PLAYER] } } });
  });

  it("merges mention + created events newest-first for the owner", async () => {
    const feed = await feedFor(cookieOwner);
    const keys = feed.map((i) => `${i.kind}:${i.entity.id}`);
    expect(keys).toEqual([
      `mention:${hiddenH}`,
      `mention:${entityA}`,
      `created:${hiddenH}`,
      `created:${entityA}`,
      `mention:${entityB}`,
      `created:${entityB}`,
    ]);
  });

  it("never names a HIDDEN entity to a member (mentions or created)", async () => {
    const feed = await feedFor(cookiePlayer);
    expect(feed.some((i) => i.entity.id === hiddenH)).toBe(false);
    const ownerFeed = await feedFor(cookieOwner);
    expect(ownerFeed.filter((i) => i.entity.id === hiddenH)).toHaveLength(2);
  });

  it("keeps another member's PRIVATE mention out but includes the caller's own", async () => {
    const ownerFeed = await feedFor(cookieOwner);
    expect(ownerFeed.some((i) => i.kind === "mention" && i.characterName === `Char ${CHAR_PLAYER}`)).toBe(false);

    const playerFeed = await feedFor(cookiePlayer);
    const own = playerFeed.find(
      (i) => i.kind === "mention" && i.characterName === `Char ${CHAR_PLAYER}`,
    );
    expect(own).toBeDefined();
    expect(own!.entity.id).toBe(entityA);
  });

  it("populates sessionOrdinal for in-session mentions and null otherwise", async () => {
    const feed = await feedFor(cookieOwner);
    const mentions = feed.filter((i) => i.kind === "mention");
    const inSession = mentions.find((i) => i.entity.id === entityA)!;
    expect(inSession.sessionOrdinal).toBe(1);
    const downtime = mentions.find((i) => i.entity.id === entityB)!;
    expect(downtime.sessionOrdinal).toBeNull();
  });

  it("slices to ?limit= after merging both streams", async () => {
    const feed = await feedFor(cookieOwner, "?limit=3");
    expect(feed.map((i) => `${i.kind}:${i.entity.id}`)).toEqual([
      `mention:${hiddenH}`,
      `mention:${entityA}`,
      `created:${hiddenH}`,
    ]);
  });
});
