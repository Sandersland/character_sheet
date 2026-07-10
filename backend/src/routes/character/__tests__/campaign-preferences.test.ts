/**
 * Campaign-scoped character preferences (#537). Real Postgres, supertest against
 * createApp(). Fixtures: a campaign owned by OWNER with PLAYER joined; PLAYER
 * owns CHAR attached to the campaign and OUTSIDER_CHAR in no campaign.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";

const OWNER = "prefs-owner";
const PLAYER = "prefs-player";
const CHAR = "test-prefs-char";
const OUTSIDER_CHAR = "test-prefs-outsider-char";

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

let cookieOwner: string;
let cookiePlayer: string;
let campaignId: string;

describe("campaign character preferences (#537)", () => {
  beforeAll(async () => {
    await ensureTestOwner(OWNER);
    await ensureTestOwner(PLAYER);
    cookieOwner = await authCookie(OWNER);
    cookiePlayer = await authCookie(PLAYER);

    await prisma.character.create({
      data: { ...BASE_CHAR, id: CHAR, name: "Bruenor", ownerId: PLAYER, spellcasting: Prisma.JsonNull },
    });
    await prisma.character.create({
      data: { ...BASE_CHAR, id: OUTSIDER_CHAR, name: "Nowhere", ownerId: PLAYER, spellcasting: Prisma.JsonNull },
    });

    const created = await agent(cookieOwner).post("/api/campaigns").send({ name: "Prefs" });
    campaignId = created.body.id;
    await agent(cookiePlayer).post("/api/campaigns/join").send({ inviteCode: created.body.inviteCode });
    await agent(cookiePlayer).post(`/api/campaigns/${campaignId}/characters`).send({ characterId: CHAR });
  });

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.character.deleteMany({ where: { id: { in: [CHAR, OUTSIDER_CHAR] } } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER, PLAYER] } } });
  });

  it("serializes default prefs (both false) for a campaign-attached character with no row", async () => {
    const res = await agent(cookiePlayer).get(`/api/characters/${CHAR}`);
    expect(res.status).toBe(200);
    expect(res.body.campaignPreferences).toEqual({
      shareWithDm: false,
      autoFriendlyHealing: false,
    });
  });

  it("omits prefs entirely when the character isn't attached to a campaign", async () => {
    const res = await agent(cookiePlayer).get(`/api/characters/${OUTSIDER_CHAR}`);
    expect(res.status).toBe(200);
    expect(res.body.campaignPreferences).toBeUndefined();
    expect(res.body.campaignId).toBeUndefined();
  });

  it("upserts and reflects both flags via the owner-only endpoint", async () => {
    const res = await agent(cookiePlayer)
      .patch(`/api/characters/${CHAR}/campaign-preferences`)
      .send({ shareWithDm: true, autoFriendlyHealing: true });
    expect(res.status).toBe(200);
    expect(res.body.campaignPreferences).toEqual({
      shareWithDm: true,
      autoFriendlyHealing: true,
    });

    // Persisted: a single row keyed by (campaign, character).
    const rows = await prisma.campaignCharacterPreference.findMany({ where: { characterId: CHAR } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ campaignId, shareWithDm: true, autoFriendlyHealing: true });
  });

  it("partial-updates one flag without clearing the other (no second row)", async () => {
    const res = await agent(cookiePlayer)
      .patch(`/api/characters/${CHAR}/campaign-preferences`)
      .send({ shareWithDm: false });
    expect(res.status).toBe(200);
    expect(res.body.campaignPreferences).toEqual({
      shareWithDm: false,
      autoFriendlyHealing: true,
    });

    const rows = await prisma.campaignCharacterPreference.findMany({ where: { characterId: CHAR } });
    expect(rows).toHaveLength(1);
  });

  it("rejects the write for a character not attached to a campaign (400)", async () => {
    const res = await agent(cookiePlayer)
      .patch(`/api/characters/${OUTSIDER_CHAR}/campaign-preferences`)
      .send({ shareWithDm: true });
    expect(res.status).toBe(400);
    const rows = await prisma.campaignCharacterPreference.findMany({ where: { characterId: OUTSIDER_CHAR } });
    expect(rows).toHaveLength(0);
  });

  it("is owner-only: a non-owner (the DM) cannot write prefs (403)", async () => {
    const res = await agent(cookieOwner)
      .patch(`/api/characters/${CHAR}/campaign-preferences`)
      .send({ shareWithDm: true });
    expect(res.status).toBe(403);
  });

  it("rejects an unknown field (strict schema, 400)", async () => {
    const res = await agent(cookiePlayer)
      .patch(`/api/characters/${CHAR}/campaign-preferences`)
      .send({ bogus: true });
    expect(res.status).toBe(400);
  });

  it("cascades: deleting the character removes its preference rows", async () => {
    const throwaway = await prisma.character.create({
      data: { ...BASE_CHAR, id: "test-prefs-throwaway", name: "Gone", ownerId: PLAYER, campaignId, spellcasting: Prisma.JsonNull },
    });
    await prisma.campaignCharacterPreference.create({
      data: { campaignId, characterId: throwaway.id, shareWithDm: true },
    });
    await prisma.character.delete({ where: { id: throwaway.id } });
    const rows = await prisma.campaignCharacterPreference.findMany({ where: { characterId: throwaway.id } });
    expect(rows).toHaveLength(0);
  });
});
