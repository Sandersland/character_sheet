/**
 * Solo (character-scoped) session lifecycle tests (#1080). A solo session is a
 * first-class Session row with campaignId null, owned by exactly one character.
 * Mirrors sessions.test.ts: real Postgres in beforeEach, supertest against
 * createApp(), plus direct lib calls to startSoloSession.
 */

import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { SessionError, startCampaignSession, startSoloSession } from "@/lib/session/sessions.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER = "owner-solo-owner";
const OUTSIDER = "owner-solo-outsider";
const CHAR_SOLO = "test-solo-char-wanderer";
const CHAR_CAMPAIGN = "test-solo-char-campaigner";

let cookie: string;
let cookieOutsider: string;

const app = createApp();
const agent = () => supertest.agent(app).set("Cookie", cookie);
const outsider = () => supertest.agent(app).set("Cookie", cookieOutsider);

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

async function makeChar(id: string, name: string) {
  await prisma.character.create({
    data: { ...BASE_CHAR, id, name, ownerId: OWNER, spellcasting: Prisma.JsonNull },
  });
}

async function attachToCampaign(characterId: string): Promise<string> {
  const campaign = await prisma.campaign.create({
    data: {
      name: "Solo Test Campaign",
      ownerId: OWNER,
      inviteCode: randomUUID(),
      members: { create: { userId: OWNER, role: "OWNER" } },
    },
  });
  await prisma.character.update({
    where: { id: characterId },
    data: { campaignId: campaign.id },
  });
  return campaign.id;
}

beforeEach(async () => {
  await ensureTestOwner(OWNER);
  await ensureTestOwner(OUTSIDER);
  cookie = await authCookie(OWNER);
  cookieOutsider = await authCookie(OUTSIDER);
  await makeChar(CHAR_SOLO, "Solo Wanderer");
  await makeChar(CHAR_CAMPAIGN, "Party Fighter");
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: { in: [CHAR_SOLO, CHAR_CAMPAIGN] } } });
  await prisma.campaign.deleteMany({ where: { ownerId: { in: [OWNER, OUTSIDER] } } });
});

describe("startSoloSession", () => {
  it("creates a campaignId-null active session with the character as sole participant", async () => {
    const session = await startSoloSession(CHAR_SOLO, "Lone Road");

    expect(session.campaignId).toBeNull();
    expect(session.status).toBe("active");
    expect(session.title).toBe("Lone Road");
    expect(session.participants).toHaveLength(1);
    expect(session.participants[0]?.characterId).toBe(CHAR_SOLO);
    expect(session.participants[0]?.leftAt).toBeNull();

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: CHAR_SOLO, type: "sessionStarted" },
    });
    expect(event?.sessionId).toBe(session.id);
  });

  it("rejects a second active solo session for the same character with 409", async () => {
    await startSoloSession(CHAR_SOLO);
    const err = await startSoloSession(CHAR_SOLO).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SessionError);
    expect((err as SessionError).status).toBe(409);
  });

  it("rejects a character attached to a campaign with 409", async () => {
    await attachToCampaign(CHAR_CAMPAIGN);
    const err = await startSoloSession(CHAR_CAMPAIGN).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SessionError);
    expect((err as SessionError).status).toBe(409);
  });
});

describe("POST /api/characters/:id/sessions — solo start", () => {
  it("201s { session, character } with a campaignId-null active session", async () => {
    const res = await agent()
      .post(`/api/characters/${CHAR_SOLO}/sessions`)
      .send({ title: "Lone Road" });

    expect(res.status).toBe(201);
    expect(res.body.session.campaignId).toBeNull();
    expect(res.body.session.status).toBe("active");
    expect(res.body.session.title).toBe("Lone Road");
    expect(res.body.session.participants).toHaveLength(1);
    expect(res.body.session.participants[0].characterId).toBe(CHAR_SOLO);
    expect(res.body.session.participants[0].leftAt).toBeNull();
    // Serialized character shape: derived fields present, id echoed.
    expect(res.body.character.id).toBe(CHAR_SOLO);
    expect(res.body.character.level).toBeGreaterThan(0);
    expect(res.body.character.proficiencyBonus).toBeGreaterThan(0);
  });

  it("409s a double-start for the same character", async () => {
    await agent().post(`/api/characters/${CHAR_SOLO}/sessions`).send({});
    const res = await agent().post(`/api/characters/${CHAR_SOLO}/sessions`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already active/i);
  });

  it("409s a character attached to a campaign", async () => {
    await attachToCampaign(CHAR_CAMPAIGN);
    const res = await agent().post(`/api/characters/${CHAR_CAMPAIGN}/sessions`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/campaign/i);
  });

  it("404s an unknown character", async () => {
    const res = await agent().post(`/api/characters/does-not-exist/sessions`).send({});
    expect(res.status).toBe(404);
  });

  it("403s another user's character", async () => {
    const res = await outsider().post(`/api/characters/${CHAR_SOLO}/sessions`).send({});
    expect(res.status).toBe(403);
  });
});

describe("POST /api/characters/:id/sessions/:sessionId/end — solo end", () => {
  it("200s { session } ended with summaries + recap and a sessionEnded event", async () => {
    const started = await startSoloSession(CHAR_SOLO, "Lone Road");
    const res = await agent().post(`/api/characters/${CHAR_SOLO}/sessions/${started.id}/end`).send({});

    expect(res.status).toBe(200);
    expect(res.body.session.status).toBe("ended");
    expect(res.body.session.summary).not.toBeNull();
    const participant = res.body.session.participants.find(
      (p: { characterId: string }) => p.characterId === CHAR_SOLO,
    );
    expect(participant.summary).not.toBeNull();

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: CHAR_SOLO, type: "sessionEnded", sessionId: started.id },
    });
    expect(event).not.toBeNull();
  });

  it("404s when the sessionId is a campaign session the character participates in", async () => {
    const campaignId = await attachToCampaign(CHAR_CAMPAIGN);
    const campaignSession = await startCampaignSession(campaignId, CHAR_CAMPAIGN);
    const res = await agent()
      .post(`/api/characters/${CHAR_CAMPAIGN}/sessions/${campaignSession.id}/end`)
      .send({});
    expect(res.status).toBe(404);
  });

  it("404s when the character is not a participant of the solo session", async () => {
    const started = await startSoloSession(CHAR_SOLO);
    const res = await agent()
      .post(`/api/characters/${CHAR_CAMPAIGN}/sessions/${started.id}/end`)
      .send({});
    expect(res.status).toBe(404);
  });

  it("409s a second end of the same solo session", async () => {
    const started = await startSoloSession(CHAR_SOLO);
    await agent().post(`/api/characters/${CHAR_SOLO}/sessions/${started.id}/end`).send({});
    const res = await agent().post(`/api/characters/${CHAR_SOLO}/sessions/${started.id}/end`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already ended/i);
  });
});

describe("campaign attach vs active solo session", () => {
  async function makeEmptyCampaign(): Promise<string> {
    const created = await agent().post("/api/campaigns").send({ name: "Late Joiners" });
    return created.body.id as string;
  }

  it("409s attaching a character that has an active solo session", async () => {
    await startSoloSession(CHAR_SOLO);
    const campaignId = await makeEmptyCampaign();
    const res = await agent()
      .post(`/api/campaigns/${campaignId}/characters`)
      .send({ characterId: CHAR_SOLO });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/solo session/i);
  });

  it("allows the attach once the solo session has ended", async () => {
    const started = await startSoloSession(CHAR_SOLO);
    const campaignId = await makeEmptyCampaign();
    await agent().post(`/api/characters/${CHAR_SOLO}/sessions/${started.id}/end`).send({});

    const res = await agent()
      .post(`/api/campaigns/${campaignId}/characters`)
      .send({ characterId: CHAR_SOLO });
    expect(res.status).toBe(200);
    expect(res.body.campaignId).toBe(campaignId);
  });
});

describe("solo session event tagging", () => {
  it("tags an HP event with the active solo session", async () => {
    const session = await startSoloSession(CHAR_SOLO);

    const hp = await agent()
      .post(`/api/characters/${CHAR_SOLO}/hp`)
      .send({ operations: [{ type: "damage", amount: 5 }] });
    expect(hp.status).toBe(200);

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: CHAR_SOLO, type: "damage" },
    });
    expect(event?.sessionId).toBe(session.id);
  });

  it("auto-attaches a journal NOTE to the active solo session", async () => {
    const session = await startSoloSession(CHAR_SOLO);

    const res = await agent()
      .post(`/api/characters/${CHAR_SOLO}/journal`)
      .send({ kind: "NOTE", body: "campfire jot" });
    expect(res.status).toBe(201);
    expect(res.body.journal[0].sessionId).toBe(session.id);
  });
});

describe("solo session doorway", () => {
  it("reports liveJoined with campaignId null after a solo start", async () => {
    const session = await startSoloSession(CHAR_SOLO, "Lone Road");

    const res = await agent().get(`/api/characters/${CHAR_SOLO}/sessions/doorway`);
    expect(res.status).toBe(200);
    expect(res.body.campaignId).toBeNull();
    expect(res.body.kind).toBe("liveJoined");
    expect(res.body.session).toMatchObject({ id: session.id, joined: true, title: "Lone Road" });
  });
});
