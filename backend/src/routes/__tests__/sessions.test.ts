/**
 * Campaign-level session lifecycle + combat/roll + summary route tests (#245).
 * Real Postgres in beforeEach, supertest against createApp(). A shared session
 * belongs to a campaign; party members join/leave it. Fixtures build a campaign
 * with an OWNER + a PLAYER, each owning one character attached to the campaign.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";
import { authCookie } from "../../test-support/auth.js";

const OWNER = "owner-sessions-owner";
const PLAYER = "owner-sessions-player";
const OUTSIDER = "owner-sessions-outsider";
const CHAR_OWNER = "test-sessions-char-owner";
const CHAR_PLAYER = "test-sessions-char-player";

let cookieOwner: string;
let cookiePlayer: string;
let cookieOutsider: string;

const app = createApp();
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

async function makeChar(id: string, name: string, ownerId: string) {
  await prisma.character.create({
    data: { ...BASE_CHAR, id, name, ownerId, spellcasting: Prisma.JsonNull },
  });
}

// Build a campaign owned by OWNER, PLAYER joined, both characters attached.
async function setupCampaign(): Promise<string> {
  const created = await agent(cookieOwner).post("/api/campaigns").send({ name: "Phandalin" });
  const { id: campaignId, inviteCode } = created.body as { id: string; inviteCode: string };
  await agent(cookiePlayer).post("/api/campaigns/join").send({ inviteCode });
  await agent(cookieOwner).post(`/api/campaigns/${campaignId}/characters`).send({ characterId: CHAR_OWNER });
  await agent(cookiePlayer).post(`/api/campaigns/${campaignId}/characters`).send({ characterId: CHAR_PLAYER });
  return campaignId;
}

function startUrl(campaignId: string) {
  return `/api/campaigns/${campaignId}/sessions`;
}

beforeEach(async () => {
  await ensureTestOwner(OWNER);
  await ensureTestOwner(PLAYER);
  await ensureTestOwner(OUTSIDER);
  cookieOwner = await authCookie(OWNER);
  cookiePlayer = await authCookie(PLAYER);
  cookieOutsider = await authCookie(OUTSIDER);
  await makeChar(CHAR_OWNER, "Owner Fighter", OWNER);
  await makeChar(CHAR_PLAYER, "Player Rogue", PLAYER);
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: { in: [CHAR_OWNER, CHAR_PLAYER] } } });
  await prisma.campaign.deleteMany({ where: { ownerId: OWNER } });
});

// ── Start ─────────────────────────────────────────────────────────────────────

describe("POST /api/campaigns/:campaignId/sessions — start", () => {
  it("starts a shared session with the first member as participant", async () => {
    const campaignId = await setupCampaign();
    const res = await agent(cookieOwner)
      .post(startUrl(campaignId))
      .send({ characterId: CHAR_OWNER, title: "Night One" });

    expect(res.status).toBe(201);
    expect(res.body.session.status).toBe("active");
    expect(res.body.session.campaignId).toBe(campaignId);
    expect(res.body.session.title).toBe("Night One");
    expect(res.body.session.participants).toHaveLength(1);
    expect(res.body.session.participants[0].characterId).toBe(CHAR_OWNER);
    expect(res.body.character.id).toBe(CHAR_OWNER);

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: CHAR_OWNER, type: "sessionStarted" },
    });
    expect(event?.sessionId).toBe(res.body.session.id);
  });

  it("409s when a session is already active for the campaign", async () => {
    const campaignId = await setupCampaign();
    await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const res = await agent(cookiePlayer).post(startUrl(campaignId)).send({ characterId: CHAR_PLAYER });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already active/i);
  });

  it("403s for a non-member", async () => {
    const campaignId = await setupCampaign();
    const res = await agent(cookieOutsider)
      .post(startUrl(campaignId))
      .send({ characterId: CHAR_OWNER });
    expect(res.status).toBe(403);
  });
});

// ── Join / leave ────────────────────────────────────────────────────────────

describe("join / leave", () => {
  it("lets a second member late-join an active session", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    const res = await agent(cookiePlayer)
      .post(`${startUrl(campaignId)}/${sessionId}/join`)
      .send({ characterId: CHAR_PLAYER });
    expect(res.status).toBe(201);

    const participants = await prisma.sessionParticipant.findMany({ where: { sessionId } });
    expect(participants).toHaveLength(2);
  });

  it("records leftAt on leave", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    const res = await agent(cookieOwner)
      .post(`${startUrl(campaignId)}/${sessionId}/leave`)
      .send({ characterId: CHAR_OWNER });
    expect(res.status).toBe(200);

    const participant = await prisma.sessionParticipant.findUniqueOrThrow({
      where: { sessionId_characterId: { sessionId, characterId: CHAR_OWNER } },
    });
    expect(participant.leftAt).not.toBeNull();
  });

  it("clears leftAt on rejoin (single interval)", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    await agent(cookieOwner).post(`${startUrl(campaignId)}/${sessionId}/leave`).send({ characterId: CHAR_OWNER });
    const rejoin = await agent(cookieOwner).post(`${startUrl(campaignId)}/${sessionId}/join`).send({ characterId: CHAR_OWNER });
    expect(rejoin.status).toBe(200);

    const participant = await prisma.sessionParticipant.findUniqueOrThrow({
      where: { sessionId_characterId: { sessionId, characterId: CHAR_OWNER } },
    });
    expect(participant.leftAt).toBeNull();
  });

  it("rejects a leave on an already-ended session", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;
    await agent(cookieOwner).post(`${startUrl(campaignId)}/${sessionId}/end`).send({});

    const res = await agent(cookieOwner)
      .post(`${startUrl(campaignId)}/${sessionId}/leave`)
      .send({ characterId: CHAR_OWNER });
    expect(res.status).toBe(409);
  });

  it("rejects a double-leave and keeps the original leftAt", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    const first = await agent(cookieOwner)
      .post(`${startUrl(campaignId)}/${sessionId}/leave`)
      .send({ characterId: CHAR_OWNER });
    expect(first.status).toBe(200);
    const afterFirst = await prisma.sessionParticipant.findUniqueOrThrow({
      where: { sessionId_characterId: { sessionId, characterId: CHAR_OWNER } },
    });

    const second = await agent(cookieOwner)
      .post(`${startUrl(campaignId)}/${sessionId}/leave`)
      .send({ characterId: CHAR_OWNER });
    expect(second.status).toBe(409);
    const afterSecond = await prisma.sessionParticipant.findUniqueOrThrow({
      where: { sessionId_characterId: { sessionId, characterId: CHAR_OWNER } },
    });
    expect(afterSecond.leftAt?.getTime()).toBe(afterFirst.leftAt?.getTime());
  });
});

// ── Auto-close ──────────────────────────────────────────────────────────────

describe("auto-close after the grace period", () => {
  it("auto-closes once every participant has been gone past the grace period", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    // Simulate the sole participant having left two hours ago (past the 1h grace).
    await prisma.sessionParticipant.update({
      where: { sessionId_characterId: { sessionId, characterId: CHAR_OWNER } },
      data: { leftAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });

    // Reading the active session triggers the auto-close → 200 null.
    const active = await agent(cookieOwner).get(`/api/characters/${CHAR_OWNER}/sessions/active`);
    expect(active.status).toBe(200);
    expect(active.body).toBeNull();

    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.status).toBe("ended");
    expect(session.summary).not.toBeNull();
  });

  it("stays open if someone rejoined before the grace elapsed", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;
    await agent(cookiePlayer).post(`${startUrl(campaignId)}/${sessionId}/join`).send({ characterId: CHAR_PLAYER });

    // Owner left long ago, but player is still present → not all left → stays open.
    await prisma.sessionParticipant.update({
      where: { sessionId_characterId: { sessionId, characterId: CHAR_OWNER } },
      data: { leftAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });

    const active = await agent(cookiePlayer).get(`/api/characters/${CHAR_PLAYER}/sessions/active`);
    expect(active.status).toBe(200);
    expect(active.body?.id).toBe(sessionId);
    expect(active.body?.status).toBe("active");
  });
});

// ── End + summaries ─────────────────────────────────────────────────────────

describe("end session", () => {
  it("OWNER force-ends; per-participant summaries and a campaign recap are persisted", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;
    await agent(cookiePlayer).post(`${startUrl(campaignId)}/${sessionId}/join`).send({ characterId: CHAR_PLAYER });

    // Each participant logs a roll (character-scoped roll route).
    await agent(cookieOwner)
      .post(`/api/characters/${CHAR_OWNER}/sessions/${sessionId}/roll`)
      .send({ kind: "attack", source: "Longsword", total: 17 });
    await agent(cookiePlayer)
      .post(`/api/characters/${CHAR_PLAYER}/sessions/${sessionId}/roll`)
      .send({ kind: "attack", source: "Dagger", total: 14 });

    const end = await agent(cookieOwner).post(`${startUrl(campaignId)}/${sessionId}/end`).send({});
    expect(end.status).toBe(200);
    expect(end.body.session.status).toBe("ended");

    const recap = end.body.session.summary;
    expect(recap.participantCount).toBe(2);
    expect(recap.attackRolls).toBe(2);

    const participants = end.body.session.participants as Array<{
      characterId: string;
      summary: { attackRolls: number; characterName: string };
    }>;
    expect(participants).toHaveLength(2);
    for (const p of participants) {
      expect(p.summary).toBeDefined();
      expect(p.summary.attackRolls).toBe(1);
    }
  });

  it("403s end for a non-member", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    const res = await agent(cookieOutsider).post(`${startUrl(campaignId)}/${sessionId}/end`).send({});
    expect(res.status).toBe(403);
  });

  it("409s ending an already-ended session", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;
    await agent(cookieOwner).post(`${startUrl(campaignId)}/${sessionId}/end`).send({});

    const res = await agent(cookieOwner).post(`${startUrl(campaignId)}/${sessionId}/end`).send({});
    expect(res.status).toBe(409);
  });
});

// ── Combat / roll participant gating ──────────────────────────────────────────

describe("combat/roll require an active participant", () => {
  it("rejects a roll from a character that has not joined the session", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    // CHAR_PLAYER never joined → not a participant.
    const res = await agent(cookiePlayer)
      .post(`/api/characters/${CHAR_PLAYER}/sessions/${sessionId}/roll`)
      .send({ kind: "attack", source: "Dagger", total: 12 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/participant/i);
  });

  it("rejects combat/round from a participant who has left", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;
    await agent(cookieOwner).post(`${startUrl(campaignId)}/${sessionId}/leave`).send({ characterId: CHAR_OWNER });

    const res = await agent(cookieOwner)
      .post(`/api/characters/${CHAR_OWNER}/sessions/${sessionId}/combat/round`)
      .send({ round: 2 });
    expect(res.status).toBe(409);
  });

  it("accepts a roll from an active participant", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    const res = await agent(cookieOwner)
      .post(`/api/characters/${CHAR_OWNER}/sessions/${sessionId}/roll`)
      .send({ kind: "attack", source: "Longsword", total: 17 });
    expect(res.status).toBe(201);
  });
});

// ── Roll kinds under the `roll` category (#128) ───────────────────────────────

describe("roll kinds log under the `roll` category", () => {
  async function activeSession(): Promise<string> {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    return start.body.session.id as string;
  }

  const rollUrl = (sessionId: string) =>
    `/api/characters/${CHAR_OWNER}/sessions/${sessionId}/roll`;

  it("logs a check roll as type checkRoll under the roll category, with data + null before/after", async () => {
    const sessionId = await activeSession();
    const res = await agent(cookieOwner).post(rollUrl(sessionId)).send({
      kind: "check", source: "Athletics", total: 18,
      ability: "strength", skill: "athletics", dc: 15, rollMode: "advantage", faces: [17],
    });
    expect(res.status).toBe(201);

    const ev = await prisma.characterEvent.findFirst({
      where: { characterId: CHAR_OWNER, type: "checkRoll" },
    });
    expect(ev).not.toBeNull();
    expect(ev!.category).toBe("roll");
    expect(ev!.before).toBeNull();
    expect(ev!.after).toBeNull();
    expect(ev!.summary).toBe("Athletics: 18 vs DC 15");
    expect(ev!.data).toMatchObject({
      kind: "check", ability: "strength", skill: "athletics", dc: 15, rollMode: "advantage", faces: [17],
    });
  });

  it("logs save + initiative rolls under the roll category", async () => {
    const sessionId = await activeSession();
    await agent(cookieOwner).post(rollUrl(sessionId)).send({
      kind: "save", source: "Dexterity save", total: 12, ability: "dexterity", dc: 13,
    });
    await agent(cookieOwner).post(rollUrl(sessionId)).send({
      kind: "initiative", source: "Initiative", total: 19, rollMode: "normal",
    });

    const save = await prisma.characterEvent.findFirst({ where: { characterId: CHAR_OWNER, type: "saveRoll" } });
    const init = await prisma.characterEvent.findFirst({ where: { characterId: CHAR_OWNER, type: "initiativeRoll" } });
    expect(save!.category).toBe("roll");
    expect(init!.category).toBe("roll");
    expect(save!.summary).toBe("Dexterity save: 12 vs DC 13");
    expect(init!.summary).toBe("Initiative: 19"); // no DC suffix
  });

  it("re-homes attack/damage rolls under the roll category", async () => {
    const sessionId = await activeSession();
    await agent(cookieOwner).post(rollUrl(sessionId)).send({ kind: "attack", source: "Longsword", total: 17 });
    await agent(cookieOwner).post(rollUrl(sessionId)).send({ kind: "damage", source: "Longsword", total: 9, damageType: "slashing" });

    const attack = await prisma.characterEvent.findFirst({ where: { characterId: CHAR_OWNER, type: "attackRoll" } });
    const dmg = await prisma.characterEvent.findFirst({ where: { characterId: CHAR_OWNER, type: "damageRoll" } });
    expect(attack!.category).toBe("roll");
    expect(dmg!.category).toBe("roll");
    expect(dmg!.summary).toBe("Longsword: 9 slashing");
  });

  it("rejects an invalid kind, rollMode, or dc with 400", async () => {
    const sessionId = await activeSession();
    const badKind = await agent(cookieOwner).post(rollUrl(sessionId)).send({ kind: "perception", source: "x", total: 1 });
    expect(badKind.status).toBe(400);
    const badMode = await agent(cookieOwner).post(rollUrl(sessionId)).send({ kind: "check", source: "x", total: 1, rollMode: "super" });
    expect(badMode.status).toBe(400);
    const badDc = await agent(cookieOwner).post(rollUrl(sessionId)).send({ kind: "save", source: "x", total: 1, dc: "high" });
    expect(badDc.status).toBe(400);
  });

  it("keeps roll events non-undoable — reverting a roll batch 409s", async () => {
    const sessionId = await activeSession();
    await agent(cookieOwner).post(rollUrl(sessionId)).send({ kind: "check", source: "Athletics", total: 18 });
    const ev = await prisma.characterEvent.findFirst({
      where: { characterId: CHAR_OWNER, type: "checkRoll" }, select: { batchId: true },
    });
    const res = await agent(cookieOwner)
      .post(`/api/characters/${CHAR_OWNER}/events/${ev!.batchId}/revert`).send({});
    expect(res.status).toBe(409);
  });
});

// ── Active-session contract (200 null, never 404 for no campaign/session) ──────

describe("GET /api/characters/:id/sessions/active", () => {
  it("returns 200 null when the character is in no campaign", async () => {
    const res = await agent(cookieOwner).get(`/api/characters/${CHAR_OWNER}/sessions/active`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("returns 200 null when the campaign has no active session", async () => {
    await setupCampaign();
    const res = await agent(cookieOwner).get(`/api/characters/${CHAR_OWNER}/sessions/active`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("returns the active session when one exists", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    const res = await agent(cookieOwner).get(`/api/characters/${CHAR_OWNER}/sessions/active`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(sessionId);
  });

  it("404s for an unknown character", async () => {
    const res = await agent(cookieOwner).get(
      "/api/characters/00000000-0000-0000-0000-000000000000/sessions/active",
    );
    expect(res.status).toBe(404);
  });
});

// ── Campaign session history + detail ─────────────────────────────────────────

describe("campaign session history + detail", () => {
  it("lists the campaign's sessions and returns detail with participants + events", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER, title: "S1" });
    const sessionId = start.body.session.id as string;

    const list = await agent(cookiePlayer).get(`/api/campaigns/${campaignId}/sessions`);
    expect(list.status).toBe(200);
    expect(list.body.some((s: { id: string }) => s.id === sessionId)).toBe(true);

    const detail = await agent(cookiePlayer).get(`/api/campaigns/${campaignId}/sessions/${sessionId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(sessionId);
    expect(Array.isArray(detail.body.participants)).toBe(true);
    expect(Array.isArray(detail.body.events)).toBe(true);
    expect(detail.body.events.some((e: { type: string }) => e.type === "sessionStarted")).toBe(true);
  });

  it("404s detail for a session in another campaign", async () => {
    const campaignId = await setupCampaign();
    const res = await agent(cookieOwner).get(
      `/api/campaigns/${campaignId}/sessions/00000000-0000-0000-0000-000000000000`,
    );
    expect(res.status).toBe(404);
  });
});

// ── sessionId threading ───────────────────────────────────────────────────────

describe("sessionId threading", () => {
  it("tags an HP event with the campaign's active session for a participant", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    const hp = await agent(cookieOwner)
      .post(`/api/characters/${CHAR_OWNER}/hp`)
      .send({ operations: [{ type: "damage", amount: 5 }] });
    expect(hp.status).toBe(200);

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: CHAR_OWNER, type: "damage" },
    });
    expect(event?.sessionId).toBe(sessionId);
  });

  it("leaves sessionId null when the character is in no campaign", async () => {
    const hp = await agent(cookieOwner)
      .post(`/api/characters/${CHAR_OWNER}/hp`)
      .send({ operations: [{ type: "damage", amount: 5 }] });
    expect(hp.status).toBe(200);

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: CHAR_OWNER, type: "damage" },
    });
    expect(event?.sessionId).toBeNull();
  });
});

// ── Retroactive XP to a past session (issue #45 carried into #245) ─────────────

describe("retroactive XP to a past session", () => {
  it("tags the award to the explicit session and recomputes its participant summary + recap", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;
    await agent(cookieOwner).post(`${startUrl(campaignId)}/${sessionId}/end`).send({});

    const award = await agent(cookieOwner)
      .post(`/api/characters/${CHAR_OWNER}/experience`)
      .send({ operations: [{ type: "award", amount: 750 }], sessionId });
    expect(award.status).toBe(200);
    expect(award.body.experiencePoints).toBe(BASE_CHAR.experiencePoints + 750);

    const detail = await agent(cookieOwner).get(`/api/campaigns/${campaignId}/sessions/${sessionId}`);
    expect(detail.body.summary.xpGained).toBe(750);
    const participant = detail.body.participants.find(
      (p: { characterId: string }) => p.characterId === CHAR_OWNER,
    );
    expect(participant.summary.xpGained).toBe(750);
  });

  it("400s when the sessionId has no participant for the character", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    // CHAR_PLAYER never joined → not a participant of this session.
    const res = await agent(cookiePlayer)
      .post(`/api/characters/${CHAR_PLAYER}/experience`)
      .send({ operations: [{ type: "award", amount: 100 }], sessionId });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a participant/i);
  });
});
