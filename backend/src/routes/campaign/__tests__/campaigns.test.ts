import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";

// Unique fixture ids for this file (parallel-safe on the shared dev DB).
const OWNER_A = "owner-campaigns-a"; // creator
const OWNER_B = "owner-campaigns-b"; // a different user
const CHAR_A = "test-campaigns-char-a";
const CHAR_B = "test-campaigns-char-b";
const CHAR_C = "test-campaigns-char-c"; // owned by A, used for the reassignment guard
const CHAR_D = "test-campaigns-char-d"; // owned by A, used for the PC-entity attach test

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

describe("campaigns (#246)", () => {
  let cookieA: string;
  let cookieB: string;

  beforeAll(async () => {
    await ensureTestOwner(OWNER_A);
    await ensureTestOwner(OWNER_B);
    cookieA = await authCookie(OWNER_A);
    cookieB = await authCookie(OWNER_B);
    await makeCharacter(CHAR_A, OWNER_A);
    await makeCharacter(CHAR_B, OWNER_B);
    await makeCharacter(CHAR_C, OWNER_A);
    await makeCharacter(CHAR_D, OWNER_A);
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: { in: [CHAR_A, CHAR_B, CHAR_C, CHAR_D] } } });
    await prisma.campaign.deleteMany({ where: { ownerId: { in: [OWNER_A, OWNER_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER_A, OWNER_B] } } });
  });

  it("creates a campaign with the creator as OWNER", async () => {
    const res = await supertest(createApp())
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "The Sunless Citadel" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("The Sunless Citadel");
    expect(res.body.inviteCode).toBeTruthy();
    const owner = (res.body.members as { userId: string; role: string }[]).find(
      (m) => m.userId === OWNER_A,
    );
    expect(owner?.role).toBe("OWNER");
  });

  // #1285: the campaign wire returns raw Prisma rows, so the column surfaces
  // without a mapper — pinned here so a future mapper can't silently drop it.
  it("exposes rulesEdition on create and on GET, defaulting to EDITION_2024", async () => {
    const created = await supertest(createApp())
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "Edition Default" });

    expect(created.status).toBe(201);
    expect(created.body.rulesEdition).toBe("EDITION_2024");

    const fetched = await supertest(createApp())
      .get(`/api/campaigns/${created.body.id as string}`)
      .set("Cookie", cookieA);

    expect(fetched.status).toBe(200);
    expect(fetched.body.rulesEdition).toBe("EDITION_2024");
  });

  // #1286: the DM picks the edition at campaign creation; it's the default new
  // characters inherit (never authoritative for an existing sheet).
  it("honours an explicit rulesEdition on create", async () => {
    const created = await supertest(createApp())
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "Edition Fourteen", rulesEdition: "EDITION_2014" });

    expect(created.status).toBe(201);
    expect(created.body.rulesEdition).toBe("EDITION_2014");
  });

  it("400s an unknown rulesEdition value on create", async () => {
    const res = await supertest(createApp())
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "Bad Edition", rulesEdition: "EDITION_2000" });
    expect(res.status).toBe(400);
  });

  it("lets a second user join via invite code as PLAYER", async () => {
    const created = await supertest(createApp())
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "Join Target" });
    const { inviteCode, id } = created.body as { inviteCode: string; id: string };

    const res = await supertest(createApp())
      .post("/api/campaigns/join")
      .set("Cookie", cookieB)
      .send({ inviteCode });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    const member = (res.body.members as { userId: string; role: string }[]).find(
      (m) => m.userId === OWNER_B,
    );
    expect(member?.role).toBe("PLAYER");
  });

  it("404s a join with a bogus invite code", async () => {
    const res = await supertest(createApp())
      .post("/api/campaigns/join")
      .set("Cookie", cookieB)
      .send({ inviteCode: "not-a-real-code" });
    expect(res.status).toBe(404);
  });

  it("403s GET for a non-member", async () => {
    const created = await supertest(createApp())
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "Private" });
    const { id } = created.body as { id: string };

    const res = await supertest(createApp())
      .get(`/api/campaigns/${id}`)
      .set("Cookie", cookieB);
    expect(res.status).toBe(403);
  });

  it("attaches a character and returns it with campaignId set", async () => {
    const created = await supertest(createApp())
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "With Character" });
    const { id } = created.body as { id: string };

    const res = await supertest(createApp())
      .post(`/api/campaigns/${id}/characters`)
      .set("Cookie", cookieA)
      .send({ characterId: CHAR_A });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(CHAR_A);
    expect(res.body.campaignId).toBe(id);
  });

  // #1286 supersedes the old "warn, never auto-convert" stance: a mismatched
  // join is now blocked outright, before it ever reaches the attach updateMany.
  it("blocks attaching a character whose rulesEdition differs from the campaign's, naming both editions", async () => {
    const createdChar = await supertest(createApp())
      .post("/api/characters")
      .set("Cookie", cookieA)
      .send({
        name: "test-campaigns-char-edition-mismatch",
        alignment: "True Neutral",
        race: "Hill Dwarf",
        background: "Sage",
        classes: [{ name: "Fighter" }],
        abilityScores: {
          strength: 15,
          dexterity: 14,
          constitution: 14,
          intelligence: 10,
          wisdom: 10,
          charisma: 8,
        },
        rulesEdition: "EDITION_2014",
      });
    expect(createdChar.status).toBe(201);
    const charId = createdChar.body.id as string;

    try {
      const campaign = await supertest(createApp())
        .post("/api/campaigns")
        .set("Cookie", cookieA)
        .send({ name: "Edition Mismatch Campaign" });
      expect(campaign.body.rulesEdition).toBe("EDITION_2024");

      const attach = await supertest(createApp())
        .post(`/api/campaigns/${campaign.body.id as string}/characters`)
        .set("Cookie", cookieA)
        .send({ characterId: charId });

      expect(attach.status).toBe(409);
      expect(attach.body.error).toMatch(/2014 rules/);
      expect(attach.body.error).toMatch(/2024 rules/);
      expect(attach.body.error).toMatch(/can't be changed/i);

      // Never wrote the mismatched campaignId (rejected before the updateMany).
      const stillUnattached = await prisma.character.findUniqueOrThrow({
        where: { id: charId },
        select: { campaignId: true, rulesEdition: true },
      });
      expect(stillUnattached.campaignId).toBeNull();
      expect(stillUnattached.rulesEdition).toBe("EDITION_2014");
    } finally {
      await prisma.character.deleteMany({ where: { id: charId } });
    }
  });

  // Regression pin, not red-first (#1285/#1286): passes today because the
  // attach handler's updateMany only ever sets campaignId. Its job is to fail
  // the day a future picker/mapper starts touching rulesEdition on a
  // same-edition attach (the mismatch guard above only rejects; it never mutates).
  it("does not convert a character's rulesEdition when it joins a same-edition campaign", async () => {
    const createdChar = await supertest(createApp())
      .post("/api/characters")
      .set("Cookie", cookieA)
      .send({
        name: "test-campaigns-char-edition-pin",
        alignment: "True Neutral",
        race: "Hill Dwarf",
        background: "Sage",
        classes: [{ name: "Fighter" }],
        abilityScores: {
          strength: 15,
          dexterity: 14,
          constitution: 14,
          intelligence: 10,
          wisdom: 10,
          charisma: 8,
        },
        rulesEdition: "EDITION_2014",
      });
    expect(createdChar.status).toBe(201);
    expect(createdChar.body.rulesEdition).toBe("EDITION_2014");
    const charId = createdChar.body.id as string;

    try {
      const campaign = await supertest(createApp())
        .post("/api/campaigns")
        .set("Cookie", cookieA)
        .send({ name: "Edition Pin Campaign", rulesEdition: "EDITION_2014" });
      expect(campaign.body.rulesEdition).toBe("EDITION_2014");

      const attach = await supertest(createApp())
        .post(`/api/campaigns/${campaign.body.id as string}/characters`)
        .set("Cookie", cookieA)
        .send({ characterId: charId });

      expect(attach.status).toBe(200);
      expect(attach.body.rulesEdition).toBe("EDITION_2014");
    } finally {
      await prisma.character.deleteMany({ where: { id: charId } });
    }
  });

  it("403s attaching a character the caller does not own", async () => {
    const created = await supertest(createApp())
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "Hijack Attempt" });
    const { id } = created.body as { id: string };

    const res = await supertest(createApp())
      .post(`/api/campaigns/${id}/characters`)
      .set("Cookie", cookieA)
      .send({ characterId: CHAR_B });
    expect(res.status).toBe(403);
  });

  it("GET /api/campaigns returns only the caller's campaigns with their role", async () => {
    const mine = await supertest(createApp())
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "A's Campaign" });
    const theirs = await supertest(createApp())
      .post("/api/campaigns")
      .set("Cookie", cookieB)
      .send({ name: "B's Campaign" });

    const res = await supertest(createApp()).get("/api/campaigns").set("Cookie", cookieA);
    expect(res.status).toBe(200);
    const list = res.body as { id: string; role: string }[];
    const mineRow = list.find((c) => c.id === mine.body.id);
    expect(mineRow?.role).toBe("OWNER");
    expect(list.some((c) => c.id === theirs.body.id)).toBe(false);
  });

  it("keeps an OWNER as OWNER when they /join their own invite code", async () => {
    const created = await supertest(createApp())
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "Self Join" });
    const { inviteCode } = created.body as { inviteCode: string };

    const res = await supertest(createApp())
      .post("/api/campaigns/join")
      .set("Cookie", cookieA)
      .send({ inviteCode });

    expect(res.status).toBe(200);
    const member = (res.body.members as { userId: string; role: string }[]).find(
      (m) => m.userId === OWNER_A,
    );
    expect(member?.role).toBe("OWNER");
  });

  it("auto-creates a PC entity + link on attach, idempotent on re-attach", async () => {
    const created = await supertest(createApp())
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "PC Entity Campaign" });
    const { id, inviteCode } = created.body as { id: string; inviteCode: string };

    await supertest(createApp())
      .post(`/api/campaigns/${id}/characters`)
      .set("Cookie", cookieA)
      .send({ characterId: CHAR_D });

    // A PC entity now exists for the attached character, with a 1:1 link.
    const link = await prisma.campaignCharacterLink.findUnique({
      where: { characterId: CHAR_D },
      include: { campaignEntity: true },
    });
    expect(link).not.toBeNull();
    expect(link?.campaignEntity.type).toBe("PC");
    expect(link?.campaignEntity.name).toBe(`Char ${CHAR_D}`);
    expect(link?.campaignEntity.campaignId).toBe(id);

    // Re-attach (same campaign) does not duplicate the entity.
    await supertest(createApp())
      .post(`/api/campaigns/${id}/characters`)
      .set("Cookie", cookieA)
      .send({ characterId: CHAR_D });
    const pcEntities = await prisma.campaignEntity.findMany({ where: { campaignId: id, type: "PC" } });
    expect(pcEntities).toHaveLength(1);

    // A second member sees the PC entity via GET …/entities.
    await supertest(createApp()).post("/api/campaigns/join").set("Cookie", cookieB).send({ inviteCode });
    const list = await supertest(createApp())
      .get(`/api/campaigns/${id}/entities`)
      .set("Cookie", cookieB);
    expect(list.status).toBe(200);
    expect((list.body as { name: string }[]).some((e) => e.name === `Char ${CHAR_D}`)).toBe(true);
  });

  it("409s attaching a character already in a different campaign", async () => {
    const first = await supertest(createApp())
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "First Home" });
    const second = await supertest(createApp())
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "Second Home" });

    const attach = await supertest(createApp())
      .post(`/api/campaigns/${first.body.id}/characters`)
      .set("Cookie", cookieA)
      .send({ characterId: CHAR_C });
    expect(attach.status).toBe(200);

    // Same-campaign re-attach is an idempotent success.
    const reSame = await supertest(createApp())
      .post(`/api/campaigns/${first.body.id}/characters`)
      .set("Cookie", cookieA)
      .send({ characterId: CHAR_C });
    expect(reSame.status).toBe(200);

    // Reassigning to a different campaign is rejected.
    const reOther = await supertest(createApp())
      .post(`/api/campaigns/${second.body.id}/characters`)
      .set("Cookie", cookieA)
      .send({ characterId: CHAR_C });
    expect(reOther.status).toBe(409);
  });
});
