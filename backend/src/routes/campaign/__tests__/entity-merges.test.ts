import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";

// Unique fixture ids for this file (parallel-safe on the shared dev DB).
const OWNER = "merge-owner";
const PLAYER = "merge-player";
const CHAR_OWNER = "merge-char-owner";

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

describe("entity identity merges (#387)", () => {
  let cookieOwner: string;
  let cookiePlayer: string;
  let campaignId: string;
  let otherCampaignId: string;

  // Fresh entity ids re-created per scenario as needed.
  async function makeEntity(
    campaign: string,
    name: string,
    visibility: "HIDDEN" | "REVEALED" = "REVEALED",
  ): Promise<string> {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaign}/entities`)
      .set("Cookie", cookieOwner)
      .send({ type: "NPC", name, visibility });
    return res.body.id as string;
  }

  beforeAll(async () => {
    await ensureTestOwner(OWNER);
    await ensureTestOwner(PLAYER);
    cookieOwner = await authCookie(OWNER);
    cookiePlayer = await authCookie(PLAYER);
    await makeCharacter(CHAR_OWNER, OWNER);

    const created = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieOwner)
      .send({ name: "Merge Campaign" });
    campaignId = created.body.id;
    const code = created.body.inviteCode as string;
    await supertest(app).post("/api/campaigns/join").set("Cookie", cookiePlayer).send({ inviteCode: code });
    await prisma.character.update({ where: { id: CHAR_OWNER }, data: { campaignId } });

    const other = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieOwner)
      .send({ name: "Other Merge Campaign" });
    otherCampaignId = other.body.id;
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: CHAR_OWNER } });
    await prisma.campaign.deleteMany({ where: { id: { in: [campaignId, otherCampaignId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER, PLAYER] } } });
  });

  it("403s a player preparing, executing, or unmerging a merge", async () => {
    const jenkins = await makeEntity(campaignId, "Jenkins P");
    const vecna = await makeEntity(campaignId, "Vecna P", "HIDDEN");
    const prep = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookiePlayer)
      .send({ mergedEntityId: jenkins, survivorEntityId: vecna });
    expect(prep.status).toBe(403);

    // Owner prepares so the player has a real record to attack.
    const ownerPrep = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: jenkins, survivorEntityId: vecna });
    const mergeId = ownerPrep.body.id as string;

    const exec = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges/${mergeId}/execute`)
      .set("Cookie", cookiePlayer);
    expect(exec.status).toBe(403);

    const unmerge = await supertest(app)
      .delete(`/api/campaigns/${campaignId}/entities/merges/${mergeId}`)
      .set("Cookie", cookiePlayer);
    expect(unmerge.status).toBe(403);
  });

  it("prepares a merge but scrubs the PREPARED record from every player payload", async () => {
    const jenkins = await makeEntity(campaignId, "Jenkins S");
    const vecna = await makeEntity(campaignId, "Vecna S", "HIDDEN");
    const prep = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: jenkins, survivorEntityId: vecna, note: "the big twist" });
    expect(prep.status).toBe(201);
    expect(prep.body.status).toBe("PREPARED");

    // Owner sees the PREPARED merge…
    const ownerMerges = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner);
    expect((ownerMerges.body as { id: string }[]).some((m) => m.id === prep.body.id)).toBe(true);

    // …the player sees nothing: no merge record, and the hidden survivor stays hidden.
    const playerMerges = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookiePlayer);
    expect((playerMerges.body as { id: string }[]).some((m) => m.id === prep.body.id)).toBe(false);

    const playerList = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookiePlayer);
    expect((playerList.body as { id: string }[]).some((e) => e.id === vecna)).toBe(false);
  });

  it("validates same-campaign, self-merge, double-merge, and cycles", async () => {
    const jenkins = await makeEntity(campaignId, "Jenkins V");
    const vecna = await makeEntity(campaignId, "Vecna V", "HIDDEN");
    const foreign = await makeEntity(otherCampaignId, "Foreign V");

    // self-merge
    const self = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: jenkins, survivorEntityId: jenkins });
    expect(self.status).toBe(400);

    // cross-campaign survivor
    const cross = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: jenkins, survivorEntityId: foreign });
    expect(cross.status).toBe(400);

    // valid prepare
    const ok = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: jenkins, survivorEntityId: vecna });
    expect(ok.status).toBe(201);

    // jenkins already merged
    const dup = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: jenkins, survivorEntityId: vecna });
    expect(dup.status).toBe(400);

    // cycle: vecna→jenkins would close the loop
    const cycle = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: vecna, survivorEntityId: jenkins });
    expect(cycle.status).toBe(400);
  });

  it("executes: flips to EXECUTED and auto-reveals a hidden survivor", async () => {
    const jenkins = await makeEntity(campaignId, "Jenkins E");
    const vecna = await makeEntity(campaignId, "Vecna E", "HIDDEN");
    const prep = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: jenkins, survivorEntityId: vecna });
    const mergeId = prep.body.id as string;

    const exec = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges/${mergeId}/execute`)
      .set("Cookie", cookieOwner);
    expect(exec.status).toBe(200);
    expect(exec.body.status).toBe("EXECUTED");
    expect(exec.body.executedAt).toBeTruthy();

    // The survivor is now revealed to players.
    const playerList = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookiePlayer);
    expect((playerList.body as { id: string }[]).some((e) => e.id === vecna)).toBe(true);

    // The player now sees the EXECUTED merge.
    const playerMerges = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookiePlayer);
    expect((playerMerges.body as { id: string }[]).some((m) => m.id === mergeId)).toBe(true);
  });

  it("unions backlinks across the executed chain, labeled by tagged identity", async () => {
    const jenkins = await makeEntity(campaignId, "Jenkins B");
    const vecna = await makeEntity(campaignId, "Vecna B");
    const whispered = await makeEntity(campaignId, "Whispered B");

    for (const [merged, survivor] of [
      [jenkins, vecna],
      [vecna, whispered],
    ]) {
      const prep = await supertest(app)
        .post(`/api/campaigns/${campaignId}/entities/merges`)
        .set("Cookie", cookieOwner)
        .send({ mergedEntityId: merged, survivorEntityId: survivor });
      await supertest(app)
        .post(`/api/campaigns/${campaignId}/entities/merges/${prep.body.id}/execute`)
        .set("Cookie", cookieOwner);
    }

    // Seed one owner-authored note tagging each identity.
    const seed = async (entityId: string, body: string) => {
      const entry = await prisma.journalEntry.create({
        data: {
          characterId: CHAR_OWNER,
          kind: "NOTE",
          date: new Date("2026-06-22T00:00:00.000Z"),
          body,
          authorUserId: OWNER,
        },
      });
      await prisma.journalEntryRef.create({ data: { entryId: entry.id, entityId } });
    };
    await seed(jenkins, "met Jenkins B");
    await seed(vecna, "saw Vecna B");
    await seed(whispered, "feared Whispered B");

    // The top survivor's backlinks union all three, each labeled by its identity.
    const res = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/${whispered}/backlinks`)
      .set("Cookie", cookieOwner);
    expect(res.status).toBe(200);
    const identityIds = (res.body as { identity: { id: string } }[]).map((b) => b.identity.id);
    expect(new Set(identityIds)).toEqual(new Set([jenkins, vecna, whispered]));

    // Jenkins alone (a leaf) only carries its own ref.
    const leaf = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/${jenkins}/backlinks`)
      .set("Cookie", cookieOwner);
    expect((leaf.body as { identity: { id: string } }[]).every((b) => b.identity.id === jenkins)).toBe(true);
  });

  it("unmerge removes the record and dissolves the union", async () => {
    const jenkins = await makeEntity(campaignId, "Jenkins U");
    const vecna = await makeEntity(campaignId, "Vecna U");
    const prep = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: jenkins, survivorEntityId: vecna });
    const mergeId = prep.body.id as string;
    await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges/${mergeId}/execute`)
      .set("Cookie", cookieOwner);

    const del = await supertest(app)
      .delete(`/api/campaigns/${campaignId}/entities/merges/${mergeId}`)
      .set("Cookie", cookieOwner);
    expect(del.status).toBe(204);

    const merges = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner);
    expect((merges.body as { id: string }[]).some((m) => m.id === mergeId)).toBe(false);
  });

  it("re-executing an EXECUTED merge keeps the first executedAt", async () => {
    const jenkins = await makeEntity(campaignId, "Jenkins I");
    const vecna = await makeEntity(campaignId, "Vecna I");
    const prep = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: jenkins, survivorEntityId: vecna });
    const mergeId = prep.body.id as string;

    const first = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges/${mergeId}/execute`)
      .set("Cookie", cookieOwner);
    expect(first.status).toBe(200);
    const firstExecutedAt = first.body.executedAt as string;
    expect(firstExecutedAt).toBeTruthy();

    const second = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges/${mergeId}/execute`)
      .set("Cookie", cookieOwner);
    expect(second.status).toBe(200);
    expect(second.body.status).toBe("EXECUTED");
    expect(second.body.executedAt).toBe(firstExecutedAt);
  });

  it("404s execute and unmerge for unknown or cross-campaign merge ids", async () => {
    const unknownId = "00000000-0000-4000-8000-000000000000";
    const execUnknown = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges/${unknownId}/execute`)
      .set("Cookie", cookieOwner);
    expect(execUnknown.status).toBe(404);

    const delUnknown = await supertest(app)
      .delete(`/api/campaigns/${campaignId}/entities/merges/${unknownId}`)
      .set("Cookie", cookieOwner);
    expect(delUnknown.status).toBe(404);

    // A real merge, but belonging to the other campaign.
    const foreignMerged = await makeEntity(otherCampaignId, "Foreign Merged X");
    const foreignSurvivor = await makeEntity(otherCampaignId, "Foreign Survivor X");
    const foreignPrep = await supertest(app)
      .post(`/api/campaigns/${otherCampaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: foreignMerged, survivorEntityId: foreignSurvivor });
    const foreignMergeId = foreignPrep.body.id as string;

    const execForeign = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges/${foreignMergeId}/execute`)
      .set("Cookie", cookieOwner);
    expect(execForeign.status).toBe(404);

    const delForeign = await supertest(app)
      .delete(`/api/campaigns/${campaignId}/entities/merges/${foreignMergeId}`)
      .set("Cookie", cookieOwner);
    expect(delForeign.status).toBe(404);
  });

  it("scrubs an EXECUTED merge whose merged identity is still HIDDEN from player payloads", async () => {
    const ghost = await makeEntity(campaignId, "Ghost H", "HIDDEN");
    const survivor = await makeEntity(campaignId, "Survivor H");
    const prep = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: ghost, survivorEntityId: survivor });
    const mergeId = prep.body.id as string;
    const exec = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges/${mergeId}/execute`)
      .set("Cookie", cookieOwner);
    expect(exec.status).toBe(200);

    const ownerMerges = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner);
    expect((ownerMerges.body as { id: string }[]).some((m) => m.id === mergeId)).toBe(true);

    // Executed, but the merged side is still HIDDEN — a player must not see it.
    const playerMerges = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookiePlayer);
    expect((playerMerges.body as { id: string }[]).some((m) => m.id === mergeId)).toBe(false);
  });

  it("excludes a HIDDEN merged identity's refs from a player's backlinks", async () => {
    const ghost = await makeEntity(campaignId, "Ghost R", "HIDDEN");
    const survivor = await makeEntity(campaignId, "Survivor R");
    const prep = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: ghost, survivorEntityId: survivor });
    await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges/${prep.body.id}/execute`)
      .set("Cookie", cookieOwner);

    // CAMPAIGN entries so entry visibility can't be the excluder.
    const seed = async (entityId: string, body: string) => {
      const entry = await prisma.journalEntry.create({
        data: {
          characterId: CHAR_OWNER,
          kind: "NOTE",
          date: new Date("2026-06-23T00:00:00.000Z"),
          body,
          visibility: "CAMPAIGN",
          authorUserId: OWNER,
        },
      });
      await prisma.journalEntryRef.create({ data: { entryId: entry.id, entityId } });
    };
    await seed(ghost, "whispers of Ghost R");
    await seed(survivor, "met Survivor R");

    const ownerRes = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/${survivor}/backlinks`)
      .set("Cookie", cookieOwner);
    const ownerIds = (ownerRes.body as { identity: { id: string } }[]).map((b) => b.identity.id);
    expect(new Set(ownerIds)).toEqual(new Set([ghost, survivor]));

    const playerRes = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/${survivor}/backlinks`)
      .set("Cookie", cookiePlayer);
    expect(playerRes.status).toBe(200);
    const playerIds = (playerRes.body as { identity: { id: string } }[]).map((b) => b.identity.id);
    expect(playerIds).toEqual([survivor]);
  });

  it("cascade-deletes the merge when either entity is deleted", async () => {
    const jenkins = await makeEntity(campaignId, "Jenkins C");
    const vecna = await makeEntity(campaignId, "Vecna C");
    const prep = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: jenkins, survivorEntityId: vecna });
    const mergeId = prep.body.id as string;

    await supertest(app)
      .delete(`/api/campaigns/${campaignId}/entities/${vecna}`)
      .set("Cookie", cookieOwner);

    const survives = await prisma.campaignEntityMerge.findUnique({ where: { id: mergeId } });
    expect(survives).toBeNull();
  });
});
