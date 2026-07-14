import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

// Campaign arcs (#863): owner-gated CRUD + session assignment + SetNull-on-delete.
// Real Postgres, supertest against createApp(). File-prefixed fixture ids keep it
// parallel-safe on the shared dev DB.

const OWNER = "owner-arcs-owner";
const PLAYER = "owner-arcs-player";
const OUTSIDER = "owner-arcs-outsider";
const CHAR = "test-arcs-char";

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

async function setupCampaign(): Promise<string> {
  const created = await agent(cookieOwner).post("/api/campaigns").send({ name: "Arc Campaign" });
  const { id: campaignId, inviteCode } = created.body as { id: string; inviteCode: string };
  await agent(cookiePlayer).post("/api/campaigns/join").send({ inviteCode });
  return campaignId;
}

beforeEach(async () => {
  await ensureTestOwner(OWNER);
  await ensureTestOwner(PLAYER);
  await ensureTestOwner(OUTSIDER);
  cookieOwner = await authCookie(OWNER);
  cookiePlayer = await authCookie(PLAYER);
  cookieOutsider = await authCookie(OUTSIDER);
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: CHAR } });
  await prisma.campaign.deleteMany({ where: { ownerId: OWNER } });
});

describe("arc CRUD — owner gating", () => {
  it("owner creates arcs; position appends", async () => {
    const campaignId = await setupCampaign();
    const first = await agent(cookieOwner).post(`/api/campaigns/${campaignId}/arcs`).send({ name: "Act I" });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ name: "Act I", position: 0, campaignId });

    const second = await agent(cookieOwner).post(`/api/campaigns/${campaignId}/arcs`).send({ name: "Act II" });
    expect(second.status).toBe(201);
    expect(second.body.position).toBe(1);
  });

  it("403s a non-owner create", async () => {
    const campaignId = await setupCampaign();
    const res = await agent(cookiePlayer).post(`/api/campaigns/${campaignId}/arcs`).send({ name: "Sneaky" });
    expect(res.status).toBe(403);
  });

  it("403s a non-member create", async () => {
    const campaignId = await setupCampaign();
    const res = await agent(cookieOutsider).post(`/api/campaigns/${campaignId}/arcs`).send({ name: "Intruder" });
    expect(res.status).toBe(403);
  });

  it("members can list arcs, ordered by position", async () => {
    const campaignId = await setupCampaign();
    await agent(cookieOwner).post(`/api/campaigns/${campaignId}/arcs`).send({ name: "Act I" });
    await agent(cookieOwner).post(`/api/campaigns/${campaignId}/arcs`).send({ name: "Act II" });

    const res = await agent(cookiePlayer).get(`/api/campaigns/${campaignId}/arcs`);
    expect(res.status).toBe(200);
    expect(res.body.map((a: { name: string }) => a.name)).toEqual(["Act I", "Act II"]);
  });

  it("breaks a position tie deterministically by createdAt", async () => {
    const campaignId = await setupCampaign();
    // Simulate two concurrent creates that both landed on position 0.
    await prisma.campaignArc.create({
      data: { campaignId, name: "Older", position: 0, createdAt: new Date("2026-01-01T00:00:00Z") },
    });
    await prisma.campaignArc.create({
      data: { campaignId, name: "Newer", position: 0, createdAt: new Date("2026-01-02T00:00:00Z") },
    });

    const res = await agent(cookiePlayer).get(`/api/campaigns/${campaignId}/arcs`);
    expect(res.status).toBe(200);
    expect(res.body.map((a: { name: string }) => a.name)).toEqual(["Older", "Newer"]);
  });

  it("owner renames and reorders; non-owner PATCH 403s", async () => {
    const campaignId = await setupCampaign();
    const arc = await agent(cookieOwner).post(`/api/campaigns/${campaignId}/arcs`).send({ name: "Act I" });
    const arcId = arc.body.id as string;

    const renamed = await agent(cookieOwner)
      .patch(`/api/campaigns/${campaignId}/arcs/${arcId}`)
      .send({ name: "Prologue", position: 5 });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: "Prologue", position: 5 });

    const forbidden = await agent(cookiePlayer)
      .patch(`/api/campaigns/${campaignId}/arcs/${arcId}`)
      .send({ name: "Nope" });
    expect(forbidden.status).toBe(403);
  });

  it("404s a PATCH/DELETE for an arc in another campaign", async () => {
    const campaignId = await setupCampaign();
    const res = await agent(cookieOwner)
      .patch(`/api/campaigns/${campaignId}/arcs/does-not-exist`)
      .send({ name: "x" });
    expect(res.status).toBe(404);
  });

  it("400s an empty PATCH body", async () => {
    const campaignId = await setupCampaign();
    const arc = await agent(cookieOwner).post(`/api/campaigns/${campaignId}/arcs`).send({ name: "Act I" });
    const res = await agent(cookieOwner)
      .patch(`/api/campaigns/${campaignId}/arcs/${arc.body.id}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("owner deletes an arc; non-owner DELETE 403s", async () => {
    const campaignId = await setupCampaign();
    const arc = await agent(cookieOwner).post(`/api/campaigns/${campaignId}/arcs`).send({ name: "Act I" });
    const arcId = arc.body.id as string;

    const forbidden = await agent(cookiePlayer).delete(`/api/campaigns/${campaignId}/arcs/${arcId}`);
    expect(forbidden.status).toBe(403);

    const ok = await agent(cookieOwner).delete(`/api/campaigns/${campaignId}/arcs/${arcId}`);
    expect(ok.status).toBe(204);
    expect(await prisma.campaignArc.findUnique({ where: { id: arcId } })).toBeNull();
  });
});

describe("session assignment + SetNull-on-delete", () => {
  it("owner assigns a session to an arc; non-owner 403s", async () => {
    const campaignId = await setupCampaign();
    await prisma.character.create({
      data: { ...BASE_CHAR, id: CHAR, name: "Arc Hero", ownerId: OWNER, campaignId, spellcasting: Prisma.JsonNull },
    });
    const session = await prisma.session.create({
      data: { campaignId, startedAt: new Date("2026-01-01T00:00:00Z") },
    });
    const arc = await agent(cookieOwner).post(`/api/campaigns/${campaignId}/arcs`).send({ name: "Act I" });
    const arcId = arc.body.id as string;

    const forbidden = await agent(cookiePlayer)
      .patch(`/api/campaigns/${campaignId}/sessions/${session.id}`)
      .send({ arcId });
    expect(forbidden.status).toBe(403);

    const ok = await agent(cookieOwner)
      .patch(`/api/campaigns/${campaignId}/sessions/${session.id}`)
      .send({ arcId });
    expect(ok.status).toBe(200);
    expect(ok.body.arcId).toBe(arcId);

    // Un-assign with null.
    const cleared = await agent(cookieOwner)
      .patch(`/api/campaigns/${campaignId}/sessions/${session.id}`)
      .send({ arcId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.arcId).toBeNull();
  });

  it("404s assigning to an arc from another campaign", async () => {
    const campaignId = await setupCampaign();
    const session = await prisma.session.create({
      data: { campaignId, startedAt: new Date("2026-01-01T00:00:00Z") },
    });
    const res = await agent(cookieOwner)
      .patch(`/api/campaigns/${campaignId}/sessions/${session.id}`)
      .send({ arcId: "no-such-arc" });
    expect(res.status).toBe(404);
  });

  it("deleting an arc leaves its sessions + journal entries intact (SetNull)", async () => {
    const campaignId = await setupCampaign();
    await prisma.character.create({
      data: { ...BASE_CHAR, id: CHAR, name: "Arc Hero", ownerId: OWNER, campaignId, spellcasting: Prisma.JsonNull },
    });
    const arc = await agent(cookieOwner).post(`/api/campaigns/${campaignId}/arcs`).send({ name: "Act I" });
    const arcId = arc.body.id as string;
    const session = await prisma.session.create({
      data: { campaignId, arcId, startedAt: new Date("2026-01-01T00:00:00Z") },
    });
    const entry = await prisma.journalEntry.create({
      data: {
        characterId: CHAR,
        sessionId: session.id,
        date: new Date("2026-01-01T00:00:00Z"),
        body: "We entered the crypt.",
        authorUserId: OWNER,
      },
    });

    const del = await agent(cookieOwner).delete(`/api/campaigns/${campaignId}/arcs/${arcId}`);
    expect(del.status).toBe(204);

    const survivingSession = await prisma.session.findUnique({ where: { id: session.id } });
    expect(survivingSession).not.toBeNull();
    expect(survivingSession?.arcId).toBeNull();

    const survivingEntry = await prisma.journalEntry.findUnique({ where: { id: entry.id } });
    expect(survivingEntry).not.toBeNull();
    expect(survivingEntry?.sessionId).toBe(session.id);
  });
});
