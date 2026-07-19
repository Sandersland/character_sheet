/**
 * Session-doorway read tests (#942): GET /api/characters/:id/sessions/doorway.
 * The doorway distills a character's session state into the frozen contract the
 * SessionDoorway bar renders. Only the live kinds (none/liveJoined/liveNotJoined)
 * are reachable pre-scheduling; the scheduled kinds arrive with #951.
 *
 * Fixtures mirror sessions.test.ts: a campaign with an OWNER + a PLAYER, each
 * owning one character attached to the campaign, plus a solo character.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER = "owner-doorway-owner";
const PLAYER = "owner-doorway-player";
const CHAR_OWNER = "test-doorway-char-owner";
const CHAR_PLAYER = "test-doorway-char-player";
const CHAR_SOLO = "test-doorway-char-solo";

let cookieOwner: string;
let cookiePlayer: string;

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

// Campaign owned by OWNER, PLAYER joined, both party characters attached.
async function setupCampaign(): Promise<string> {
  const created = await agent(cookieOwner).post("/api/campaigns").send({ name: "Phandalin" });
  const { id: campaignId, inviteCode } = created.body as { id: string; inviteCode: string };
  await agent(cookiePlayer).post("/api/campaigns/join").send({ inviteCode });
  await agent(cookieOwner).post(`/api/campaigns/${campaignId}/characters`).send({ characterId: CHAR_OWNER });
  await agent(cookiePlayer).post(`/api/campaigns/${campaignId}/characters`).send({ characterId: CHAR_PLAYER });
  return campaignId;
}

function doorwayUrl(characterId: string) {
  return `/api/characters/${characterId}/sessions/doorway`;
}

function startUrl(campaignId: string) {
  return `/api/campaigns/${campaignId}/sessions`;
}

beforeEach(async () => {
  await ensureTestOwner(OWNER);
  await ensureTestOwner(PLAYER);
  cookieOwner = await authCookie(OWNER);
  cookiePlayer = await authCookie(PLAYER);
  await makeChar(CHAR_OWNER, "Owner Fighter", OWNER);
  await makeChar(CHAR_PLAYER, "Player Rogue", PLAYER);
  await makeChar(CHAR_SOLO, "Solo Wanderer", OWNER);
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: { in: [CHAR_OWNER, CHAR_PLAYER, CHAR_SOLO] } } });
  await prisma.campaign.deleteMany({ where: { ownerId: OWNER } });
});

describe("GET /api/characters/:id/sessions/doorway", () => {
  it("returns none + canStart for a solo character with no active session (#1080)", async () => {
    const res = await agent(cookieOwner).get(doorwayUrl(CHAR_SOLO));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      campaignId: null,
      role: "PLAYER",
      canStart: true,
      kind: "none",
      session: null,
    });
  });

  it("returns none + canStart for a member with no active session (OWNER)", async () => {
    await setupCampaign();
    const res = await agent(cookieOwner).get(doorwayUrl(CHAR_OWNER));
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("none");
    expect(res.body.session).toBeNull();
    expect(res.body.role).toBe("OWNER");
    expect(res.body.canStart).toBe(true);
    expect(typeof res.body.campaignId).toBe("string");
  });

  it("returns none + canStart for a PLAYER member with no active session", async () => {
    await setupCampaign();
    const res = await agent(cookiePlayer).get(doorwayUrl(CHAR_PLAYER));
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("none");
    expect(res.body.role).toBe("PLAYER");
    expect(res.body.canStart).toBe(true);
  });

  it("returns liveJoined for the character in the active session", async () => {
    const campaignId = await setupCampaign();
    await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER, title: "Night One" });

    const res = await agent(cookieOwner).get(doorwayUrl(CHAR_OWNER));
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("liveJoined");
    expect(res.body.session).toMatchObject({
      status: "active",
      title: "Night One",
      joined: true,
      scheduledAt: null,
      round: null,
    });
    expect(typeof res.body.session.startedAt).toBe("string");
  });

  it("returns liveNotJoined for a member not in the active session", async () => {
    const campaignId = await setupCampaign();
    await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });

    const res = await agent(cookiePlayer).get(doorwayUrl(CHAR_PLAYER));
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("liveNotJoined");
    expect(res.body.session.joined).toBe(false);
  });

  it("derives round from the latest combatRoundAdvanced event", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    const roundUrl = `/api/characters/${CHAR_OWNER}/sessions/${sessionId}/combat/round`;
    await agent(cookieOwner).post(roundUrl).send({ round: 2 });
    await agent(cookieOwner).post(roundUrl).send({ round: 3 });

    const res = await agent(cookieOwner).get(doorwayUrl(CHAR_OWNER));
    expect(res.body.kind).toBe("liveJoined");
    expect(res.body.session.round).toBe(3);
  });

  it("403s for a character the caller does not own", async () => {
    await setupCampaign();
    const res = await agent(cookiePlayer).get(doorwayUrl(CHAR_OWNER));
    expect(res.status).toBe(403);
  });
});
