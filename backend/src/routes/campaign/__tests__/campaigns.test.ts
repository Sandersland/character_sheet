import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { deleteCampaignRows } from "@/lib/campaign/campaign-delete.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";

// Unique fixture ids for this file (parallel-safe on the shared dev DB).
const OWNER_A = "owner-campaigns-a";
const OWNER_B = "owner-campaigns-b";
const CHAR_A = "test-campaigns-char-a";
const CHAR_B = "test-campaigns-char-b";
const CHAR_C = "test-campaigns-char-c";
const CHAR_D = "test-campaigns-char-d";
const CHAR_E = "test-campaigns-char-e";

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
    await makeCharacter(CHAR_E, OWNER_A);
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: { in: [CHAR_A, CHAR_B, CHAR_C, CHAR_D, CHAR_E] } } });
    await prisma.campaign.deleteMany({ where: { ownerId: { in: [OWNER_A, OWNER_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER_A, OWNER_B] } } });
  });

  it("creates a campaign with the creator as OWNER", async () => {
    const res = await supertest(app)
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

  it("exposes rulesEdition on create and on GET, defaulting to EDITION_2024", async () => {
    const created = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "Edition Default" });

    expect(created.status).toBe(201);
    expect(created.body.rulesEdition).toBe("EDITION_2024");

    const fetched = await supertest(app)
      .get(`/api/campaigns/${created.body.id as string}`)
      .set("Cookie", cookieA);

    expect(fetched.status).toBe(200);
    expect(fetched.body.rulesEdition).toBe("EDITION_2024");
  });

  it("honours an explicit rulesEdition on create", async () => {
    const created = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "Edition Fourteen", rulesEdition: "EDITION_2014" });

    expect(created.status).toBe(201);
    expect(created.body.rulesEdition).toBe("EDITION_2014");
  });

  // All four campaign-returning responses are checked together, since withEditionLabel is applied per res.json site.
  it("carries rulesEditionLabel on create, list, detail and join", async () => {
    const created = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "Label Table", rulesEdition: "EDITION_2014" });
    expect(created.status).toBe(201);
    expect(created.body.rulesEditionLabel).toBe("2014 rules");

    const id = created.body.id as string;

    const list = await supertest(app).get("/api/campaigns").set("Cookie", cookieA);
    const listed = (list.body as { id: string; rulesEditionLabel: string; role: string }[]).find(
      (c) => c.id === id,
    );
    expect(listed?.rulesEditionLabel).toBe("2014 rules");
    // The list spread must not have clobbered `role`.
    expect(listed?.role).toBe("OWNER");

    const detail = await supertest(app).get(`/api/campaigns/${id}`).set("Cookie", cookieA);
    expect(detail.body.rulesEditionLabel).toBe("2014 rules");
    expect(detail.body.role).toBe("OWNER");

    const joined = await supertest(app)
      .post("/api/campaigns/join")
      .set("Cookie", cookieB)
      .send({ inviteCode: created.body.inviteCode });
    expect(joined.body.rulesEditionLabel).toBe("2014 rules");
  });

  it("400s an unknown rulesEdition value on create", async () => {
    const res = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "Bad Edition", rulesEdition: "EDITION_2000" });
    expect(res.status).toBe(400);
  });

  it("lets a second user join via invite code as PLAYER", async () => {
    const created = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "Join Target" });
    const { inviteCode, id } = created.body as { inviteCode: string; id: string };

    const res = await supertest(app)
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
    const res = await supertest(app)
      .post("/api/campaigns/join")
      .set("Cookie", cookieB)
      .send({ inviteCode: "not-a-real-code" });
    expect(res.status).toBe(404);
  });

  it("403s GET for a non-member", async () => {
    const created = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "Private" });
    const { id } = created.body as { id: string };

    const res = await supertest(app)
      .get(`/api/campaigns/${id}`)
      .set("Cookie", cookieB);
    expect(res.status).toBe(403);
  });

  it("attaches a character and returns it with campaignId set", async () => {
    const created = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "With Character" });
    const { id } = created.body as { id: string };

    const res = await supertest(app)
      .post(`/api/campaigns/${id}/characters`)
      .set("Cookie", cookieA)
      .send({ characterId: CHAR_A });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(CHAR_A);
    expect(res.body.campaignId).toBe(id);
  });

  it("blocks attaching a character whose rulesEdition differs from the campaign's, naming both editions", async () => {
    const createdChar = await supertest(app)
      .post("/api/characters")
      .set("Cookie", cookieA)
      .send({
        name: "test-campaigns-char-edition-mismatch",
        alignment: "True Neutral",
        ...(await seededSpeciesAnchor("EDITION_2014")),
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
      const campaign = await supertest(app)
        .post("/api/campaigns")
        .set("Cookie", cookieA)
        .send({ name: "Edition Mismatch Campaign" });
      expect(campaign.body.rulesEdition).toBe("EDITION_2024");

      const attach = await supertest(app)
        .post(`/api/campaigns/${campaign.body.id as string}/characters`)
        .set("Cookie", cookieA)
        .send({ characterId: charId });

      expect(attach.status).toBe(409);
      expect(attach.body.error).toMatch(/2014 rules/);
      expect(attach.body.error).toMatch(/2024 rules/);
      expect(attach.body.error).toMatch(/can't be changed/i);

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

  // Not a pin for "attach never converts rulesEdition" — a same-edition write is a no-op either way.
  it("does not convert a character's rulesEdition when it joins a same-edition campaign", async () => {
    const createdChar = await supertest(app)
      .post("/api/characters")
      .set("Cookie", cookieA)
      .send({
        name: "test-campaigns-char-edition-pin",
        alignment: "True Neutral",
        ...(await seededSpeciesAnchor("EDITION_2014")),
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
      const campaign = await supertest(app)
        .post("/api/campaigns")
        .set("Cookie", cookieA)
        .send({ name: "Edition Pin Campaign", rulesEdition: "EDITION_2014" });
      expect(campaign.body.rulesEdition).toBe("EDITION_2014");

      const attach = await supertest(app)
        .post(`/api/campaigns/${campaign.body.id as string}/characters`)
        .set("Cookie", cookieA)
        .send({ characterId: charId });

      expect(attach.status).toBe(200);
      expect(attach.body.rulesEdition).toBe("EDITION_2014");
    } finally {
      await prisma.character.deleteMany({ where: { id: charId } });
    }
  });

  // Shaped to catch a future handler that blindly forwards rulesEdition onto the campaign row.
  it("leaves a campaign's rulesEdition unchanged after a character joins", async () => {
    const campaign = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "Immutable Edition Campaign", rulesEdition: "EDITION_2014" });
    const campaignId = campaign.body.id as string;

    const createdChar = await supertest(app)
      .post("/api/characters")
      .set("Cookie", cookieA)
      .send({
        name: "test-campaigns-char-campaign-edition-pin",
        alignment: "True Neutral",
        ...(await seededSpeciesAnchor("EDITION_2014")),
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
    const charId = createdChar.body.id as string;

    try {
      const attach = await supertest(app)
        .post(`/api/campaigns/${campaignId}/characters`)
        .set("Cookie", cookieA)
        .send({ characterId: charId });
      expect(attach.status).toBe(200);

      const after = await supertest(app)
        .get(`/api/campaigns/${campaignId}`)
        .set("Cookie", cookieA);
      expect(after.body.rulesEdition).toBe("EDITION_2014");
    } finally {
      await prisma.character.deleteMany({ where: { id: charId } });
    }
  });

  it("403s attaching a character the caller does not own", async () => {
    const created = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "Hijack Attempt" });
    const { id } = created.body as { id: string };

    const res = await supertest(app)
      .post(`/api/campaigns/${id}/characters`)
      .set("Cookie", cookieA)
      .send({ characterId: CHAR_B });
    expect(res.status).toBe(403);
  });

  it("GET /api/campaigns returns only the caller's campaigns with their role", async () => {
    const mine = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "A's Campaign" });
    const theirs = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieB)
      .send({ name: "B's Campaign" });

    const res = await supertest(app).get("/api/campaigns").set("Cookie", cookieA);
    expect(res.status).toBe(200);
    const list = res.body as { id: string; role: string }[];
    const mineRow = list.find((c) => c.id === mine.body.id);
    expect(mineRow?.role).toBe("OWNER");
    expect(list.some((c) => c.id === theirs.body.id)).toBe(false);
  });

  it("keeps an OWNER as OWNER when they /join their own invite code", async () => {
    const created = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "Self Join" });
    const { inviteCode } = created.body as { inviteCode: string };

    const res = await supertest(app)
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
    const created = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "PC Entity Campaign" });
    const { id, inviteCode } = created.body as { id: string; inviteCode: string };

    await supertest(app)
      .post(`/api/campaigns/${id}/characters`)
      .set("Cookie", cookieA)
      .send({ characterId: CHAR_D });

    const link = await prisma.campaignCharacterLink.findUnique({
      where: { characterId: CHAR_D },
      include: { campaignEntity: true },
    });
    expect(link).not.toBeNull();
    expect(link?.campaignEntity.type).toBe("PC");
    expect(link?.campaignEntity.name).toBe(`Char ${CHAR_D}`);
    expect(link?.campaignEntity.campaignId).toBe(id);

    await supertest(app)
      .post(`/api/campaigns/${id}/characters`)
      .set("Cookie", cookieA)
      .send({ characterId: CHAR_D });
    const pcEntities = await prisma.campaignEntity.findMany({ where: { campaignId: id, type: "PC" } });
    expect(pcEntities).toHaveLength(1);

    await supertest(app).post("/api/campaigns/join").set("Cookie", cookieB).send({ inviteCode });
    const list = await supertest(app)
      .get(`/api/campaigns/${id}/entities`)
      .set("Cookie", cookieB);
    expect(list.status).toBe(200);
    expect((list.body as { name: string }[]).some((e) => e.name === `Char ${CHAR_D}`)).toBe(true);
  });

  describe("DELETE /api/campaigns/:id", () => {
    async function makeCampaign(name: string): Promise<{ id: string; inviteCode: string }> {
      const created = await supertest(app)
        .post("/api/campaigns")
        .set("Cookie", cookieA)
        .send({ name });
      expect(created.status).toBe(201);
      return created.body as { id: string; inviteCode: string };
    }

    it("404s a nonexistent campaign and 403s non-owners", async () => {
      const missing = await supertest(app)
        .delete("/api/campaigns/00000000-0000-0000-0000-000000000000")
        .set("Cookie", cookieA);
      expect(missing.status).toBe(404);

      const { id, inviteCode } = await makeCampaign("Not Yours To Delete");

      const nonMember = await supertest(app).delete(`/api/campaigns/${id}`).set("Cookie", cookieB);
      expect(nonMember.status).toBe(403);

      await supertest(app).post("/api/campaigns/join").set("Cookie", cookieB).send({ inviteCode });
      const player = await supertest(app).delete(`/api/campaigns/${id}`).set("Cookie", cookieB);
      expect(player.status).toBe(403);

      await expect(
        prisma.campaign.findUniqueOrThrow({ where: { id } }),
      ).resolves.toMatchObject({ id });
    });

    it("deletes the campaign; characters survive detached, sessions and memberships die", async () => {
      const { id } = await makeCampaign("Doomed Campaign");
      const attach = await supertest(app)
        .post(`/api/campaigns/${id}/characters`)
        .set("Cookie", cookieA)
        .send({ characterId: CHAR_E });
      expect(attach.status).toBe(200);
      const endedSession = await prisma.session.create({
        data: { campaignId: id, status: "ended", endedAt: new Date() },
      });

      const res = await supertest(app).delete(`/api/campaigns/${id}`).set("Cookie", cookieA);
      expect(res.status).toBe(204);

      expect(await prisma.campaign.findUnique({ where: { id } })).toBeNull();
      expect(await prisma.session.findUnique({ where: { id: endedSession.id } })).toBeNull();
      expect(await prisma.campaignMembership.findMany({ where: { campaignId: id } })).toHaveLength(0);
      const survivor = await prisma.character.findUniqueOrThrow({
        where: { id: CHAR_E },
        select: { campaignId: true },
      });
      expect(survivor.campaignId).toBeNull();
    });

    it("deletes despite an active session orphaned by character deletion (auto-settles it)", async () => {
      const { id } = await makeCampaign("Orphaned Session Campaign");
      const orphanChar = "test-campaigns-char-orphan";
      await makeCharacter(orphanChar, OWNER_A);
      const attach = await supertest(app)
        .post(`/api/campaigns/${id}/characters`)
        .set("Cookie", cookieA)
        .send({ characterId: orphanChar });
      expect(attach.status).toBe(200);
      await prisma.session.create({
        data: { campaignId: id, status: "active", participants: { create: { characterId: orphanChar } } },
      });
      await prisma.character.delete({ where: { id: orphanChar } });

      const res = await supertest(app).delete(`/api/campaigns/${id}`).set("Cookie", cookieA);
      expect(res.status).toBe(204);
      expect(await prisma.campaign.findUnique({ where: { id } })).toBeNull();
    });

    // Must resolve as a success (not P2025-into-500) when the campaign is already gone.
    it("resolves already-gone as success in the delete tx body", async () => {
      const result = await prisma.$transaction((tx) =>
        deleteCampaignRows(tx, "00000000-0000-0000-0000-000000000000"),
      );
      expect(result).toEqual([]);
    });

    it("never 500s when two deletes race — the loser gets an idempotent 204 or a 404", async () => {
      const { id } = await makeCampaign("Double Delete Campaign");

      const [first, second] = await Promise.all([
        supertest(app).delete(`/api/campaigns/${id}`).set("Cookie", cookieA),
        supertest(app).delete(`/api/campaigns/${id}`).set("Cookie", cookieA),
      ]);

      expect([204, 404]).toContain(first.status);
      expect([204, 404]).toContain(second.status);
      expect(await prisma.campaign.findUnique({ where: { id } })).toBeNull();
    });

    it("409s while a session is active, then deletes once it has ended", async () => {
      const { id } = await makeCampaign("Mid-Session Campaign");
      // A live session has a present participant — a participantless one would auto-settle instead of 409ing.
      const active = await prisma.session.create({
        data: { campaignId: id, status: "active", participants: { create: { characterId: CHAR_A } } },
      });

      const blocked = await supertest(app).delete(`/api/campaigns/${id}`).set("Cookie", cookieA);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error).toMatch(/active session/i);
      await expect(
        prisma.campaign.findUniqueOrThrow({ where: { id } }),
      ).resolves.toMatchObject({ id });

      await prisma.session.update({
        where: { id: active.id },
        data: { status: "ended", endedAt: new Date() },
      });
      const res = await supertest(app).delete(`/api/campaigns/${id}`).set("Cookie", cookieA);
      expect(res.status).toBe(204);
    });
  });

  it("409s attaching a character already in a different campaign", async () => {
    const first = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "First Home" });
    const second = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieA)
      .send({ name: "Second Home" });

    const attach = await supertest(app)
      .post(`/api/campaigns/${first.body.id}/characters`)
      .set("Cookie", cookieA)
      .send({ characterId: CHAR_C });
    expect(attach.status).toBe(200);

    const reSame = await supertest(app)
      .post(`/api/campaigns/${first.body.id}/characters`)
      .set("Cookie", cookieA)
      .send({ characterId: CHAR_C });
    expect(reSame.status).toBe(200);

    const reOther = await supertest(app)
      .post(`/api/campaigns/${second.body.id}/characters`)
      .set("Cookie", cookieA)
      .send({ characterId: CHAR_C });
    expect(reOther.status).toBe(409);
  });
});
