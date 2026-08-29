import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

// Sessions are created directly via prisma with explicit startedAt so the derived sessionNumber is deterministic.

const OWNER = "owner-chronicle-owner";
const PLAYER = "owner-chronicle-player";
const NONPART = "owner-chronicle-nonpart";
const OUTSIDER = "owner-chronicle-outsider";
const CHAR_OWNER = "test-chronicle-char-owner";
const CHAR_PLAYER = "test-chronicle-char-player";

let cookieOwner: string;
let cookiePlayer: string;
let cookieNonpart: string;
let cookieOutsider: string;

const agent = (cookie: string) => supertest.agent(app).set("Cookie", cookie);

const BASE_CHAR = {
  alignment: "True Neutral",
  experiencePoints: 900,
  initiativeBonus: 2,
  speed: 30,
  hitPoints: { current: 28, max: 28, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 3, die: "d10", spent: 0 },
  abilityScores: {
    strength: 16, dexterity: 14, constitution: 14,
    intelligence: 10, wisdom: 10, charisma: 8,
  },
  savingThrowProficiencies: ["strength", "constitution"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 50, pp: 0 },
};

async function makeChar(id: string, name: string, ownerId: string, campaignId: string) {
  await prisma.character.create({
    data: { ...BASE_CHAR, id, name, ownerId, campaignId, spellcasting: Prisma.JsonNull },
  });
}

async function setupCampaign(): Promise<string> {
  const created = await agent(cookieOwner).post("/api/campaigns").send({ name: "Chronicle Campaign" });
  const { id: campaignId, inviteCode } = created.body as { id: string; inviteCode: string };
  await agent(cookiePlayer).post("/api/campaigns/join").send({ inviteCode });
  await agent(cookieNonpart).post("/api/campaigns/join").send({ inviteCode });
  return campaignId;
}

beforeEach(async () => {
  await ensureTestOwner(OWNER);
  await ensureTestOwner(PLAYER);
  await ensureTestOwner(NONPART);
  await ensureTestOwner(OUTSIDER);
  cookieOwner = await authCookie(OWNER);
  cookiePlayer = await authCookie(PLAYER);
  cookieNonpart = await authCookie(NONPART);
  cookieOutsider = await authCookie(OUTSIDER);
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: { in: [CHAR_OWNER, CHAR_PLAYER] } } });
  await prisma.campaign.deleteMany({ where: { ownerId: OWNER } });
});

describe("chronicle payload — GET /api/campaigns/:id/sessions", () => {
  it("returns sessions newest-first with derived sessionNumber, arcId, and note counts", async () => {
    const campaignId = await setupCampaign();
    await makeChar(CHAR_PLAYER, "Player Rogue", PLAYER, campaignId);

    const arc = await agent(cookieOwner).post(`/api/campaigns/${campaignId}/arcs`).send({ name: "Act I" });
    const arcId = arc.body.id as string;

    // Only the newest (c) is left active — Session_campaignId_active_key (schema.prisma) allows
    // at most one active session per campaign, so history's older rows must already be ended.
    const a = await prisma.session.create({
      data: {
        campaignId,
        arcId,
        status: "ended",
        startedAt: new Date("2026-01-01T00:00:00Z"),
        endedAt: new Date("2026-01-01T04:00:00Z"),
      },
    });
    const b = await prisma.session.create({
      data: {
        campaignId,
        status: "ended",
        startedAt: new Date("2026-01-02T00:00:00Z"),
        endedAt: new Date("2026-01-02T04:00:00Z"),
      },
    });
    const c = await prisma.session.create({
      data: { campaignId, startedAt: new Date("2026-01-03T00:00:00Z") },
    });

    for (const [sessionId, count] of [[a.id, 2], [c.id, 1]] as const) {
      for (let i = 0; i < count; i++) {
        await prisma.journalEntry.create({
          data: {
            characterId: CHAR_PLAYER,
            sessionId,
            date: new Date("2026-01-01T00:00:00Z"),
            body: `note ${i}`,
            authorUserId: PLAYER,
          },
        });
      }
    }

    const res = await agent(cookiePlayer)
      .get(`/api/campaigns/${campaignId}/sessions`)
      .query({ characterId: CHAR_PLAYER });
    expect(res.status).toBe(200);

    expect(res.body.map((s: { id: string }) => s.id)).toEqual([c.id, b.id, a.id]);

    const byId = Object.fromEntries(
      res.body.map((s: { id: string; sessionNumber: number; noteCount: number; arcId: string | null }) => [s.id, s]),
    );
    expect(byId[a.id].sessionNumber).toBe(1);
    expect(byId[b.id].sessionNumber).toBe(2);
    expect(byId[c.id].sessionNumber).toBe(3);
    expect(byId[a.id].noteCount).toBe(2);
    expect(byId[b.id].noteCount).toBe(0);
    expect(byId[c.id].noteCount).toBe(1);
    expect(byId[a.id].arcId).toBe(arcId);
    expect(byId[b.id].arcId).toBeNull();
  });

  it("omits note counts (0) without a characterId, still deriving sessionNumber", async () => {
    const campaignId = await setupCampaign();
    const a = await prisma.session.create({
      data: { campaignId, startedAt: new Date("2026-01-01T00:00:00Z") },
    });

    const res = await agent(cookiePlayer).get(`/api/campaigns/${campaignId}/sessions`);
    expect(res.status).toBe(200);
    const row = res.body.find((s: { id: string }) => s.id === a.id);
    expect(row.sessionNumber).toBe(1);
    expect(row.noteCount).toBe(0);
  });

  it("403s a characterId the caller does not own", async () => {
    const campaignId = await setupCampaign();
    await makeChar(CHAR_OWNER, "Owner Fighter", OWNER, campaignId);
    const res = await agent(cookiePlayer)
      .get(`/api/campaigns/${campaignId}/sessions`)
      .query({ characterId: CHAR_OWNER });
    expect(res.status).toBe(403);
  });

  it("403s a non-member", async () => {
    const campaignId = await setupCampaign();
    const res = await agent(cookieOutsider).get(`/api/campaigns/${campaignId}/sessions`);
    expect(res.status).toBe(403);
  });
});

describe("session title editing — PATCH { title }", () => {
  it("lets a participant set the title; a non-participant member 403s", async () => {
    const campaignId = await setupCampaign();
    await makeChar(CHAR_PLAYER, "Player Rogue", PLAYER, campaignId);
    const session = await prisma.session.create({
      data: { campaignId, startedAt: new Date("2026-01-01T00:00:00Z") },
    });
    await prisma.sessionParticipant.create({
      data: { sessionId: session.id, characterId: CHAR_PLAYER },
    });

    const ok = await agent(cookiePlayer)
      .patch(`/api/campaigns/${campaignId}/sessions/${session.id}`)
      .send({ title: "The Sunless Citadel" });
    expect(ok.status).toBe(200);
    expect(ok.body.title).toBe("The Sunless Citadel");

    const forbidden = await agent(cookieNonpart)
      .patch(`/api/campaigns/${campaignId}/sessions/${session.id}`)
      .send({ title: "Nope" });
    expect(forbidden.status).toBe(403);

    const outsider = await agent(cookieOutsider)
      .patch(`/api/campaigns/${campaignId}/sessions/${session.id}`)
      .send({ title: "Also nope" });
    expect(outsider.status).toBe(403);

    const persisted = await prisma.session.findUnique({ where: { id: session.id } });
    expect(persisted?.title).toBe("The Sunless Citadel");
  });

  it("404s a session that isn't in the campaign", async () => {
    const campaignId = await setupCampaign();
    const res = await agent(cookieOwner)
      .patch(`/api/campaigns/${campaignId}/sessions/does-not-exist`)
      .send({ title: "x" });
    expect(res.status).toBe(404);
  });

  it("400s an empty PATCH body", async () => {
    const campaignId = await setupCampaign();
    const session = await prisma.session.create({
      data: { campaignId, startedAt: new Date("2026-01-01T00:00:00Z") },
    });
    const res = await agent(cookieOwner)
      .patch(`/api/campaigns/${campaignId}/sessions/${session.id}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
