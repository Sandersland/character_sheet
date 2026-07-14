import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";

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

  it("hides HIDDEN entities from a non-owner list but shows them to the owner", async () => {
    const created = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookieOwner)
      .send({ type: "NPC", name: "Secret Cult", visibility: "HIDDEN" });
    expect(created.status).toBe(201);
    expect(created.body.visibility).toBe("HIDDEN");
    const hiddenId = created.body.id as string;

    const playerList = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookiePlayer);
    expect((playerList.body as { id: string }[]).some((e) => e.id === hiddenId)).toBe(false);

    const ownerList = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookieOwner);
    expect((ownerList.body as { id: string }[]).some((e) => e.id === hiddenId)).toBe(true);
  });

  it("rejects a PLAYER creating a HIDDEN entity (visibility is owner-only)", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookiePlayer)
      .send({ type: "NPC", name: "Player Secret", visibility: "HIDDEN" });
    expect(res.status).toBe(403);
  });

  it("lets the OWNER toggle visibility but 403s a PLAYER", async () => {
    const created = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookieOwner)
      .send({ type: "NPC", name: "Toggle Target" });
    const id = created.body.id as string;
    expect(created.body.visibility).toBe("REVEALED");

    const denied = await supertest(app)
      .patch(`/api/campaigns/${campaignId}/entities/${id}`)
      .set("Cookie", cookiePlayer)
      .send({ visibility: "HIDDEN" });
    expect(denied.status).toBe(403);

    const ok = await supertest(app)
      .patch(`/api/campaigns/${campaignId}/entities/${id}`)
      .set("Cookie", cookieOwner)
      .send({ visibility: "HIDDEN" });
    expect(ok.status).toBe(200);
    expect(ok.body.visibility).toBe("HIDDEN");

    // A player editing a basic field on the now-hidden entity 404s (invisible).
    const basicEdit = await supertest(app)
      .patch(`/api/campaigns/${campaignId}/entities/${id}`)
      .set("Cookie", cookiePlayer)
      .send({ notes: "sneaky" });
    expect(basicEdit.status).toBe(404);
  });

  it("404s a non-owner reading backlinks of a HIDDEN entity", async () => {
    const created = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookieOwner)
      .send({ type: "NPC", name: "Hidden Backlink", visibility: "HIDDEN" });
    const id = created.body.id as string;

    const player = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/${id}/backlinks`)
      .set("Cookie", cookiePlayer);
    expect(player.status).toBe(404);

    const owner = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/${id}/backlinks`)
      .set("Cookie", cookieOwner);
    expect(owner.status).toBe(200);
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

  it("shares CAMPAIGN notes across members but keeps PRIVATE notes author-only, even from the OWNER (#838)", async () => {
    await prisma.character.update({ where: { id: CHAR_OWNER }, data: { campaignId } });
    await prisma.character.update({ where: { id: CHAR_PLAYER }, data: { campaignId } });

    const entity = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookieOwner)
      .send({ type: "NPC", name: "Shared Target" });
    const entityId = entity.body.id as string;

    async function seedEntry(characterId: string, authorUserId: string, body: string, visibility: "PRIVATE" | "CAMPAIGN") {
      const entry = await prisma.journalEntry.create({
        data: {
          characterId,
          kind: "NOTE",
          date: new Date("2026-07-01T00:00:00.000Z"),
          body,
          visibility,
          authorUserId,
        },
      });
      await prisma.journalEntryRef.create({ data: { entryId: entry.id, entityId } });
    }

    await seedEntry(CHAR_PLAYER, PLAYER, "player shared note", "CAMPAIGN");
    await seedEntry(CHAR_PLAYER, PLAYER, "player secret note", "PRIVATE");
    await seedEntry(CHAR_OWNER, OWNER, "owner shared note", "CAMPAIGN");
    await seedEntry(CHAR_OWNER, OWNER, "owner secret note", "PRIVATE");

    async function bodiesFor(cookie: string) {
      const res = await supertest(app)
        .get(`/api/campaigns/${campaignId}/entities/${entityId}/backlinks`)
        .set("Cookie", cookie);
      expect(res.status).toBe(200);
      return (res.body as { entry: { body: string } }[]).map((b) => b.entry.body);
    }

    // Player sees the owner's CAMPAIGN note plus everything they authored.
    const playerBodies = await bodiesFor(cookiePlayer);
    expect(playerBodies).toContain("owner shared note");
    expect(playerBodies).toContain("player shared note");
    expect(playerBodies).toContain("player secret note");
    expect(playerBodies).not.toContain("owner secret note");

    // The OWNER/DM has no bypass: another member's PRIVATE note stays invisible.
    const ownerBodies = await bodiesFor(cookieOwner);
    expect(ownerBodies).toContain("player shared note");
    expect(ownerBodies).toContain("owner shared note");
    expect(ownerBodies).toContain("owner secret note");
    expect(ownerBodies).not.toContain("player secret note");
  });

  it("exposes the linked characterId on PC entities and null elsewhere (#842)", async () => {
    await prisma.character.update({ where: { id: CHAR_PLAYER }, data: { campaignId: null } });
    const attach = await supertest(app)
      .post(`/api/campaigns/${campaignId}/characters`)
      .set("Cookie", cookiePlayer)
      .send({ characterId: CHAR_PLAYER });
    expect(attach.status).toBe(200);

    const list = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookiePlayer);
    expect(list.status).toBe(200);
    const rows = list.body as { type: string; name: string; characterId: string | null }[];
    const pc = rows.find((e) => e.type === "PC" && e.name === `Char ${CHAR_PLAYER}`);
    expect(pc).toBeDefined();
    expect(pc?.characterId).toBe(CHAR_PLAYER);
    expect(pc).not.toHaveProperty("characterLink");
    const npc = rows.find((e) => e.name === "Goblin Chief");
    expect(npc?.characterId).toBeNull();
  });

  it("keeps characterId present alongside ?include=stats (#842)", async () => {
    const list = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities?include=stats`)
      .set("Cookie", cookiePlayer);
    expect(list.status).toBe(200);
    const rows = list.body as { type: string; characterId: string | null; stats?: unknown }[];
    const pc = rows.find((e) => e.type === "PC");
    expect(pc?.characterId).toBe(CHAR_PLAYER);
    expect(pc?.stats).toBeDefined();
  });

  it("drops a CAMPAIGN note from backlinks once its character leaves the campaign (#838)", async () => {
    await prisma.character.update({ where: { id: CHAR_OWNER }, data: { campaignId } });
    await prisma.character.update({ where: { id: CHAR_PLAYER }, data: { campaignId } });

    const entity = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookieOwner)
      .send({ type: "NPC", name: "Departed Target" });
    const entityId = entity.body.id as string;

    const entry = await prisma.journalEntry.create({
      data: {
        characterId: CHAR_PLAYER,
        kind: "NOTE",
        date: new Date("2026-07-01T00:00:00.000Z"),
        body: "shared, then departed",
        visibility: "CAMPAIGN",
        authorUserId: PLAYER,
      },
    });
    await prisma.journalEntryRef.create({ data: { entryId: entry.id, entityId } });

    // Refs survive the character leaving; the share must not.
    await prisma.character.update({ where: { id: CHAR_PLAYER }, data: { campaignId: null } });

    const ownerView = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/${entityId}/backlinks`)
      .set("Cookie", cookieOwner);
    expect(ownerView.status).toBe(200);
    const bodies = (ownerView.body as { entry: { body: string } }[]).map((b) => b.entry.body);
    expect(bodies).not.toContain("shared, then departed");

    // The author still sees their own entry regardless of campaign membership.
    const playerView = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/${entityId}/backlinks`)
      .set("Cookie", cookiePlayer);
    expect(playerView.status).toBe(200);
    const playerBodies = (playerView.body as { entry: { body: string } }[]).map((b) => b.entry.body);
    expect(playerBodies).toContain("shared, then departed");
  });
});
