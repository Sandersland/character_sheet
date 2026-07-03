import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { authCookie } from "../../test-support/auth.js";
import { ensureTestOwner } from "../../test-support/owner.js";

// Unique fixture ids for this file (parallel-safe on the shared dev DB).
const OWNER = "owner-entities-owner"; // campaign OWNER
const PLAYER = "owner-entities-player"; // a member (PLAYER role)
const OUTSIDER = "owner-entities-outsider"; // not a member
const CHAR_OWNER = "test-entities-char-owner";
const CHAR_PLAYER = "test-entities-char-player";

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

describe("campaign entities (#248)", () => {
  let cookieOwner: string;
  let cookiePlayer: string;
  let cookieOutsider: string;
  let campaignId: string;
  let otherCampaignId: string;

  beforeAll(async () => {
    await ensureTestOwner(OWNER);
    await ensureTestOwner(PLAYER);
    await ensureTestOwner(OUTSIDER);
    cookieOwner = await authCookie(OWNER);
    cookiePlayer = await authCookie(PLAYER);
    cookieOutsider = await authCookie(OUTSIDER);
    await makeCharacter(CHAR_OWNER, OWNER);
    await makeCharacter(CHAR_PLAYER, PLAYER);

    const created = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieOwner)
      .send({ name: "Entity Campaign" });
    campaignId = created.body.id;
    const code = created.body.inviteCode as string;

    await supertest(app).post("/api/campaigns/join").set("Cookie", cookiePlayer).send({ inviteCode: code });

    const other = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieOutsider)
      .send({ name: "Other Campaign" });
    otherCampaignId = other.body.id;
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: { in: [CHAR_OWNER, CHAR_PLAYER] } } });
    await prisma.campaign.deleteMany({ where: { id: { in: [campaignId, otherCampaignId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER, PLAYER, OUTSIDER] } } });
  });

  it("creates an entity (any member) and lists it", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookiePlayer)
      .send({ type: "NPC", name: "Goblin Chief", aliases: ["Grik"] });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("NPC");
    expect(res.body.name).toBe("Goblin Chief");

    const list = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookieOwner);
    expect(list.status).toBe(200);
    expect((list.body as { name: string }[]).some((e) => e.name === "Goblin Chief")).toBe(true);
  });

  it("searches name and aliases via normalized match", async () => {
    await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookieOwner)
      .send({ type: "LOCATION", name: "Baldur's Gate", aliases: ["The Gate"] });

    const byNormalizedName = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities?q=baldurs`)
      .set("Cookie", cookieOwner);
    expect((byNormalizedName.body as { name: string }[]).some((e) => e.name === "Baldur's Gate")).toBe(true);

    const byAlias = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities?q=grik`)
      .set("Cookie", cookieOwner);
    expect((byAlias.body as { name: string }[]).some((e) => e.name === "Goblin Chief")).toBe(true);
  });

  it("filters by type", async () => {
    const res = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities?type=LOCATION`)
      .set("Cookie", cookieOwner);
    expect(res.status).toBe(200);
    const types = (res.body as { type: string }[]).map((e) => e.type);
    expect(types.length).toBeGreaterThan(0);
    expect(types.every((t) => t === "LOCATION")).toBe(true);
  });

  it("lets any member edit", async () => {
    const created = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookieOwner)
      .send({ type: "FACTION", name: "Thieves Guild" });
    const id = created.body.id as string;

    const res = await supertest(app)
      .patch(`/api/campaigns/${campaignId}/entities/${id}`)
      .set("Cookie", cookiePlayer)
      .send({ notes: "Operates from the docks" });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("Operates from the docks");
  });

  it("403s a non-member create", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookieOutsider)
      .send({ type: "NPC", name: "Intruder" });
    expect(res.status).toBe(403);
  });

  it("404s editing an entity from a different campaign", async () => {
    const created = await supertest(app)
      .post(`/api/campaigns/${otherCampaignId}/entities`)
      .set("Cookie", cookieOutsider)
      .send({ type: "NPC", name: "Foreign NPC" });
    const foreignId = created.body.id as string;

    const res = await supertest(app)
      .patch(`/api/campaigns/${campaignId}/entities/${foreignId}`)
      .set("Cookie", cookieOwner)
      .send({ notes: "x" });
    expect(res.status).toBe(404);
  });

  it("403s a PLAYER delete and 204s an OWNER delete", async () => {
    const created = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookieOwner)
      .send({ type: "OTHER", name: "Disposable" });
    const id = created.body.id as string;

    const denied = await supertest(app)
      .delete(`/api/campaigns/${campaignId}/entities/${id}`)
      .set("Cookie", cookiePlayer);
    expect(denied.status).toBe(403);

    const ok = await supertest(app)
      .delete(`/api/campaigns/${campaignId}/entities/${id}`)
      .set("Cookie", cookieOwner);
    expect(ok.status).toBe(204);
  });

  it("returns backlinks but excludes another member's PRIVATE notes", async () => {
    // Both characters belong to this campaign so their notes can tag entities.
    await prisma.character.update({ where: { id: CHAR_OWNER }, data: { campaignId } });
    await prisma.character.update({ where: { id: CHAR_PLAYER }, data: { campaignId } });

    const entity = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookieOwner)
      .send({ type: "NPC", name: "Backlink Target" });
    const entityId = entity.body.id as string;

    // Seed refs directly so this route is tested independent of the journal-write
    // derivation (Chunk 4): the owner's own note and a player's PRIVATE note.
    const ownerEntry = await prisma.journalEntry.create({
      data: {
        characterId: CHAR_OWNER,
        kind: "NOTE",
        date: new Date("2026-06-22T00:00:00.000Z"),
        body: "Spotted near camp",
        authorUserId: OWNER,
      },
    });
    const playerEntry = await prisma.journalEntry.create({
      data: {
        characterId: CHAR_PLAYER,
        kind: "NOTE",
        date: new Date("2026-06-22T00:00:00.000Z"),
        body: "Bribed the target",
        authorUserId: PLAYER,
      },
    });
    await prisma.journalEntryRef.createMany({
      data: [
        { entryId: ownerEntry.id, entityId },
        { entryId: playerEntry.id, entityId },
      ],
    });

    const ownerView = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/${entityId}/backlinks`)
      .set("Cookie", cookieOwner);
    expect(ownerView.status).toBe(200);
    const ownerBodies = (ownerView.body as { entry: { body: string } }[]).map((b) => b.entry.body);
    expect(ownerBodies).toContain("Spotted near camp");
    expect(ownerBodies.some((b) => b.includes("Bribed"))).toBe(false);
    expect((ownerView.body as { characterName: string }[])[0].characterName).toBe(`Char ${CHAR_OWNER}`);
  });
});
