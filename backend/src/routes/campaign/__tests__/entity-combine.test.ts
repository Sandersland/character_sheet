import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { __resetBlobStoreForTests, createBlobStore } from "@/lib/storage/index.js";
import { PORTRAIT_FIELD } from "@/lib/storage/portrait-http.js";

// Unique fixture ids for this file (parallel-safe on the shared dev DB).
const OWNER = "combine-owner";
const PLAYER = "combine-player";
const CHAR_OWNER = "combine-char-owner";
const CHAR_PLAYER = "combine-char-player";

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

describe("entity combine-duplicates (#1942)", () => {
  let cookieOwner: string;
  let cookiePlayer: string;
  let campaignId: string;
  let otherCampaignId: string;

  async function makeEntity(
    campaign: string,
    name: string,
    type: "NPC" | "LOCATION" | "FACTION" | "ITEM" | "PC" | "OTHER" = "NPC",
    visibility: "HIDDEN" | "REVEALED" = "REVEALED",
  ): Promise<string> {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaign}/entities`)
      .set("Cookie", cookieOwner)
      .send({ type, name, visibility });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  // A note authored by CHAR_OWNER tagging entityIds by hand-built @[<id>] tokens
  // — combine must find these by scanning body text, not by trusting refs alone.
  async function seedEntry(opts: {
    characterId?: string;
    authorUserId?: string;
    body: string;
    visibility?: "PRIVATE" | "CAMPAIGN";
    entityIds: string[];
  }): Promise<string> {
    const entry = await prisma.journalEntry.create({
      data: {
        characterId: opts.characterId ?? CHAR_OWNER,
        kind: "NOTE",
        date: new Date("2026-06-01T00:00:00.000Z"),
        body: opts.body,
        visibility: opts.visibility ?? "CAMPAIGN",
        authorUserId: opts.authorUserId ?? OWNER,
      },
    });
    for (const entityId of opts.entityIds) {
      await prisma.journalEntryRef.create({ data: { entryId: entry.id, entityId } });
    }
    return entry.id;
  }

  async function combine(entityId: string, survivorEntityId: string, cookie = cookieOwner) {
    return supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/${entityId}/combine`)
      .set("Cookie", cookie)
      .send({ survivorEntityId });
  }

  beforeAll(async () => {
    await ensureTestOwner(OWNER);
    await ensureTestOwner(PLAYER);
    cookieOwner = await authCookie(OWNER);
    cookiePlayer = await authCookie(PLAYER);
    await makeCharacter(CHAR_OWNER, OWNER);
    await makeCharacter(CHAR_PLAYER, PLAYER);

    const created = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieOwner)
      .send({ name: "Combine Campaign" });
    campaignId = created.body.id;
    const code = created.body.inviteCode as string;
    await supertest(app).post("/api/campaigns/join").set("Cookie", cookiePlayer).send({ inviteCode: code });
    await prisma.character.update({ where: { id: CHAR_OWNER }, data: { campaignId } });
    await prisma.character.update({ where: { id: CHAR_PLAYER }, data: { campaignId } });

    const other = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieOwner)
      .send({ name: "Other Combine Campaign" });
    otherCampaignId = other.body.id;
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: { in: [CHAR_OWNER, CHAR_PLAYER] } } });
    await prisma.campaign.deleteMany({ where: { id: { in: [campaignId, otherCampaignId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER, PLAYER] } } });
  });

  it("403s a non-owner combining entities", async () => {
    const dup = await makeEntity(campaignId, "lili");
    const surv = await makeEntity(campaignId, "Lili");
    const res = await combine(dup, surv, cookiePlayer);
    expect(res.status).toBe(403);
  });

  it("400s a self-combine", async () => {
    const solo = await makeEntity(campaignId, "Solo");
    const res = await combine(solo, solo);
    expect(res.status).toBe(400);
  });

  it("404s an unknown duplicate, an unknown survivor, and a cross-campaign entity", async () => {
    const unknownId = "00000000-0000-4000-8000-000000000000";
    const surv = await makeEntity(campaignId, "Survivor 404");
    const dup = await makeEntity(campaignId, "Dup 404");
    const foreign = await makeEntity(otherCampaignId, "Foreign 404");

    expect((await combine(unknownId, surv)).status).toBe(404);
    expect((await combine(dup, unknownId)).status).toBe(404);
    expect((await combine(dup, foreign)).status).toBe(404);
    expect((await combine(foreign, surv)).status).toBe(404);
  });

  it("rewrites mention tokens across all journal entries regardless of author/visibility, reconciling refs", async () => {
    const dup = await makeEntity(campaignId, "lili A");
    const surv = await makeEntity(campaignId, "Lili A");

    // Owner-authored CAMPAIGN note.
    const campaignEntry = await seedEntry({
      body: `We met @[${dup}] at the inn.`,
      visibility: "CAMPAIGN",
      entityIds: [dup],
    });
    // A different player's PRIVATE note — combine must reach this too.
    const privateEntry = await seedEntry({
      characterId: CHAR_PLAYER,
      authorUserId: PLAYER,
      body: `Secretly suspicious of @[${dup}].`,
      visibility: "PRIVATE",
      entityIds: [dup],
    });

    const res = await combine(dup, surv);
    expect(res.status).toBe(200);

    const afterCampaign = await prisma.journalEntry.findUniqueOrThrow({ where: { id: campaignEntry } });
    const afterPrivate = await prisma.journalEntry.findUniqueOrThrow({ where: { id: privateEntry } });
    expect(afterCampaign.body).toBe(`We met @[${surv}] at the inn.`);
    expect(afterPrivate.body).toBe(`Secretly suspicious of @[${surv}].`);
    expect(afterCampaign.body).not.toContain(dup);
    expect(afterPrivate.body).not.toContain(dup);

    const refs = await prisma.journalEntryRef.findMany({
      where: { entryId: { in: [campaignEntry, privateEntry] } },
    });
    expect(refs.every((r) => r.entityId === surv)).toBe(true);
    expect(refs.some((r) => r.entityId === dup)).toBe(false);

    // The duplicate is gone from the list. The survivor's mention count unions
    // the distinct entries from both prior ref sets — the player can see both
    // (the CAMPAIGN note as a member, their own PRIVATE note as its author);
    // PRIVATE notes have no DM bypass, so this reads as the player, not owner.
    const list = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities?include=stats`)
      .set("Cookie", cookiePlayer);
    expect((list.body as { id: string }[]).some((e) => e.id === dup)).toBe(false);
    const survRow = (list.body as { id: string; stats: { mentionCount: number } }[]).find(
      (e) => e.id === surv,
    );
    expect(survRow?.stats.mentionCount).toBe(2);
  });

  it("dedupes a dual-tagged entry to a single ref, counted once", async () => {
    const dup = await makeEntity(campaignId, "lili B");
    const surv = await makeEntity(campaignId, "Lili B");

    const entryId = await seedEntry({
      body: `@[${dup}] and @[${surv}] argued.`,
      entityIds: [dup, surv],
    });

    const res = await combine(dup, surv);
    expect(res.status).toBe(200);

    const after = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(after.body).toBe(`@[${surv}] and @[${surv}] argued.`);

    const refs = await prisma.journalEntryRef.findMany({ where: { entryId } });
    expect(refs).toHaveLength(1);
    expect(refs[0].entityId).toBe(surv);
  });

  it("no @[<dupId>] token remains anywhere in the campaign after combining", async () => {
    const dup = await makeEntity(campaignId, "lili C");
    const surv = await makeEntity(campaignId, "Lili C");
    await seedEntry({ body: `@[${dup}]`, entityIds: [dup] });
    await seedEntry({
      characterId: CHAR_PLAYER,
      authorUserId: PLAYER,
      body: `Also @[${dup}] here.`,
      visibility: "PRIVATE",
      entityIds: [dup],
    });

    const res = await combine(dup, surv);
    expect(res.status).toBe(200);

    const allEntries = await prisma.journalEntry.findMany({ where: { character: { campaignId } } });
    expect(allEntries.some((e) => e.body.includes(dup))).toBe(false);
  });

  it("leaves no activity-feed rows for the deleted duplicate", async () => {
    const dup = await makeEntity(campaignId, "lili D");
    const surv = await makeEntity(campaignId, "Lili D");
    await seedEntry({ body: `@[${dup}]`, entityIds: [dup] });

    const res = await combine(dup, surv);
    expect(res.status).toBe(200);

    const activity = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities/activity?limit=50`)
      .set("Cookie", cookieOwner);
    expect(activity.status).toBe(200);
    const ids = (activity.body as { entity: { id: string } }[]).map((row) => row.entity.id);
    expect(ids).not.toContain(dup);
  });

  it("does not 500 on a stale token in the same body and leaves it untouched", async () => {
    const dup = await makeEntity(campaignId, "lili Stale");
    const surv = await makeEntity(campaignId, "Lili Stale");
    // No CampaignEntity backs this id — text left behind by, e.g., an entity
    // deleted outright rather than combined. Re-deriving refs from the whole
    // rewritten body (extractEntityIds) would try to insert a ref for it and
    // hit the entityId foreign key; combine must never do that.
    const staleId = randomUUID();
    const entryId = await seedEntry({
      body: `@[${staleId}] warned us about @[${dup}].`,
      entityIds: [dup],
    });

    const res = await combine(dup, surv);
    expect(res.status).toBe(200);

    const after = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(after.body).toBe(`@[${staleId}] warned us about @[${surv}].`);

    const refs = await prisma.journalEntryRef.findMany({ where: { entryId } });
    expect(refs.map((r) => r.entityId)).toEqual([surv]);
  });

  it("does not create a ref for a hidden entity's untouched token elsewhere in a rewritten body", async () => {
    const hidden = await makeEntity(campaignId, "Ghost Hidden", "NPC", "HIDDEN");
    const dup = await makeEntity(campaignId, "lili Hidden");
    const surv = await makeEntity(campaignId, "Lili Hidden");

    // A real journal write, through the actual route, as a non-owner — the
    // hidden-entity guard in syncEntryRefs (routes/session/journal.ts, #379)
    // suppresses the hidden ref here, leaving the token as unbacked text.
    const created = await supertest(app)
      .post(`/api/characters/${CHAR_PLAYER}/journal`)
      .set("Cookie", cookiePlayer)
      .send({ kind: "NOTE", body: `@[${hidden}] and @[${dup}] both showed up.`, visibility: "CAMPAIGN" });
    expect(created.status).toBe(201);
    const entryId = created.body.journal[0].id as string;

    const preRefs = await prisma.journalEntryRef.findMany({ where: { entryId } });
    expect(preRefs.map((r) => r.entityId)).toEqual([dup]);

    const res = await combine(dup, surv);
    expect(res.status).toBe(200);

    const after = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entryId } });
    // The dup token rewrites; the hidden token, untouched by this combine, stays.
    expect(after.body).toBe(`@[${hidden}] and @[${surv}] both showed up.`);

    const postRefs = await prisma.journalEntryRef.findMany({ where: { entryId } });
    expect(postRefs.map((r) => r.entityId)).toEqual([surv]);
    expect(postRefs.some((r) => r.entityId === hidden)).toBe(false);
  });

  it("re-points a merge chain through the duplicate as survivor (A -> dup, dup absorbed into S) into A -> S", async () => {
    const a = await makeEntity(campaignId, "A chain");
    const dup = await makeEntity(campaignId, "lili E");
    const surv = await makeEntity(campaignId, "Lili E");

    const prep = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: a, survivorEntityId: dup });
    expect(prep.status).toBe(201);
    const mergeId = prep.body.id as string;

    const res = await combine(dup, surv);
    expect(res.status).toBe(200);

    const after = await prisma.campaignEntityMerge.findUniqueOrThrow({ where: { id: mergeId } });
    expect(after.mergedEntityId).toBe(a);
    expect(after.survivorEntityId).toBe(surv);
  });

  it("drops a merge row that would become self-referential when re-pointed", async () => {
    const dup = await makeEntity(campaignId, "lili F");
    const surv = await makeEntity(campaignId, "Lili F");

    // "Lili F is secretly lili F" — survivor merged into the duplicate.
    const prep = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: surv, survivorEntityId: dup });
    expect(prep.status).toBe(201);
    const mergeId = prep.body.id as string;

    const res = await combine(dup, surv);
    expect(res.status).toBe(200);

    const after = await prisma.campaignEntityMerge.findUnique({ where: { id: mergeId } });
    expect(after).toBeNull();
  });

  it("drops a merge row that would close a cycle against the rest of the graph", async () => {
    const chained = await makeEntity(campaignId, "Chained G");
    const dup = await makeEntity(campaignId, "lili G");
    const surv = await makeEntity(campaignId, "Lili G");

    // Survivor is already secretly `chained` (S -> chained)…
    const survChain = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: surv, survivorEntityId: chained });
    expect(survChain.status).toBe(201);

    // …and separately `chained` was prepared as secretly the duplicate
    // (chained -> dup). Re-pointing to (chained -> S) would close S -> chained -> S.
    const cyclic = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: chained, survivorEntityId: dup });
    expect(cyclic.status).toBe(201);
    const cyclicMergeId = cyclic.body.id as string;

    const res = await combine(dup, surv);
    expect(res.status).toBe(200);

    const after = await prisma.campaignEntityMerge.findUnique({ where: { id: cyclicMergeId } });
    expect(after).toBeNull();
    // The unrelated S -> chained row survives untouched.
    const survivingChain = await prisma.campaignEntityMerge.findUniqueOrThrow({
      where: { id: survChain.body.id as string },
    });
    expect(survivingChain.survivorEntityId).toBe(chained);
  });

  it("cascade-deletes merge rows where the duplicate was the merged (non-survivor) side", async () => {
    const dup = await makeEntity(campaignId, "lili H");
    const surv = await makeEntity(campaignId, "Lili H");
    const ghost = await makeEntity(campaignId, "Ghost H");

    const prep = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: dup, survivorEntityId: ghost });
    expect(prep.status).toBe(201);
    const mergeId = prep.body.id as string;

    const res = await combine(dup, surv);
    expect(res.status).toBe(200);

    const after = await prisma.campaignEntityMerge.findUnique({ where: { id: mergeId } });
    expect(after).toBeNull();
  });

  it("forces the survivor REVEALED when re-pointing an EXECUTED merge chain onto it", async () => {
    const a = await makeEntity(campaignId, "A Reveal");
    const dup = await makeEntity(campaignId, "lili Reveal");
    const surv = await makeEntity(campaignId, "Lili Reveal", "NPC", "HIDDEN");

    const prep = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: a, survivorEntityId: dup });
    expect(prep.status).toBe(201);
    const mergeId = prep.body.id as string;
    const exec = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges/${mergeId}/execute`)
      .set("Cookie", cookieOwner);
    expect(exec.status).toBe(200);

    const res = await combine(dup, surv);
    expect(res.status).toBe(200);

    const survivorRow = await prisma.campaignEntity.findUniqueOrThrow({ where: { id: surv } });
    expect(survivorRow.visibility).toBe("REVEALED");
    const after = await prisma.campaignEntityMerge.findUniqueOrThrow({ where: { id: mergeId } });
    expect(after.survivorEntityId).toBe(surv);
    expect(after.status).toBe("EXECUTED");
  });

  it("409s combining away a duplicate that is a publicly revealed (EXECUTED) merged identity", async () => {
    const dup = await makeEntity(campaignId, "lili Revealed");
    const surv = await makeEntity(campaignId, "Lili Revealed");
    const trueName = await makeEntity(campaignId, "True Name Revealed");

    // "lili Revealed is publicly revealed to be True Name Revealed" — dup is
    // the MERGED (non-survivor) side of an EXECUTED row: a fact players may
    // already know, so combining it away can't just cascade-delete the row.
    const prep = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: dup, survivorEntityId: trueName });
    expect(prep.status).toBe(201);
    const mergeId = prep.body.id as string;
    const exec = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges/${mergeId}/execute`)
      .set("Cookie", cookieOwner);
    expect(exec.status).toBe(200);

    const res = await combine(dup, surv);
    expect(res.status).toBe(409);

    // Nothing was touched.
    const stillDup = await prisma.campaignEntity.findUnique({ where: { id: dup } });
    expect(stillDup).not.toBeNull();
    const stillMerge = await prisma.campaignEntityMerge.findUnique({ where: { id: mergeId } });
    expect(stillMerge).not.toBeNull();
  });

  it("moves a character link from an unlinked duplicate onto the survivor", async () => {
    await makeCharacter("combine-link-char-1", OWNER);
    const attach = await supertest(app)
      .post(`/api/campaigns/${campaignId}/characters`)
      .set("Cookie", cookieOwner)
      .send({ characterId: "combine-link-char-1" });
    expect(attach.status).toBe(200);

    const linkRow = await prisma.campaignCharacterLink.findUniqueOrThrow({
      where: { characterId: "combine-link-char-1" },
    });
    const dupPcId = linkRow.campaignEntityId;
    const surv = await makeEntity(campaignId, "Real PC Name", "PC");

    const res = await combine(dupPcId, surv);
    expect(res.status).toBe(200);
    expect(res.body.characterId).toBe("combine-link-char-1");

    const movedLink = await prisma.campaignCharacterLink.findUniqueOrThrow({
      where: { characterId: "combine-link-char-1" },
    });
    expect(movedLink.campaignEntityId).toBe(surv);

    await prisma.character.deleteMany({ where: { id: "combine-link-char-1" } });
  });

  it("409s combining two entities that both carry a character link", async () => {
    await makeCharacter("combine-link-char-2a", OWNER);
    await makeCharacter("combine-link-char-2b", OWNER);
    await supertest(app)
      .post(`/api/campaigns/${campaignId}/characters`)
      .set("Cookie", cookieOwner)
      .send({ characterId: "combine-link-char-2a" });
    await supertest(app)
      .post(`/api/campaigns/${campaignId}/characters`)
      .set("Cookie", cookieOwner)
      .send({ characterId: "combine-link-char-2b" });

    const linkA = await prisma.campaignCharacterLink.findUniqueOrThrow({
      where: { characterId: "combine-link-char-2a" },
    });
    const linkB = await prisma.campaignCharacterLink.findUniqueOrThrow({
      where: { characterId: "combine-link-char-2b" },
    });

    const res = await combine(linkA.campaignEntityId, linkB.campaignEntityId);
    expect(res.status).toBe(409);

    // Neither row was touched.
    const stillA = await prisma.campaignEntity.findUnique({ where: { id: linkA.campaignEntityId } });
    expect(stillA).not.toBeNull();

    await prisma.character.deleteMany({
      where: { id: { in: ["combine-link-char-2a", "combine-link-char-2b"] } },
    });
  });

  async function makeItemEntity(name: string): Promise<{ entityId: string; itemId: string }> {
    const entity = await prisma.campaignEntity.create({
      data: { campaignId, type: "ITEM", name, visibility: "HIDDEN" },
    });
    const item = await prisma.item.create({
      data: {
        scope: "CAMPAIGN",
        scopeKey: `campaign:${campaignId}`,
        campaignId,
        name,
        category: "gear",
        link: { create: { campaignEntityId: entity.id } },
      },
    });
    return { entityId: entity.id, itemId: item.id };
  }

  it("moves an item link from an unlinked duplicate onto the survivor", async () => {
    const { entityId: dupItem } = await makeItemEntity("Dup Item");
    const surv = await makeEntity(campaignId, "Survivor Item", "ITEM");

    const res = await combine(dupItem, surv);
    expect(res.status).toBe(200);

    const link = await prisma.campaignItemLink.findUniqueOrThrow({ where: { campaignEntityId: surv } });
    expect(link.campaignEntityId).toBe(surv);
  });

  it("409s combining two entities that both carry an item link", async () => {
    const { entityId: itemA } = await makeItemEntity("Item A");
    const { entityId: itemB } = await makeItemEntity("Item B");

    const res = await combine(itemA, itemB);
    expect(res.status).toBe(409);
  });

  it("409s moving an item link onto a non-ITEM survivor", async () => {
    const { entityId: dupItem, itemId } = await makeItemEntity("Orphan-Risk Item");
    const surv = await makeEntity(campaignId, "Not An Item", "NPC");

    const res = await combine(dupItem, surv);
    expect(res.status).toBe(409);

    // Nothing moved: the item's link still fronts the duplicate entity.
    const link = await prisma.campaignItemLink.findUniqueOrThrow({ where: { itemId } });
    expect(link.campaignEntityId).toBe(dupItem);
    const stillDup = await prisma.campaignEntity.findUnique({ where: { id: dupItem } });
    expect(stillDup).not.toBeNull();
  });

  it("allows a cross-type combine, survivor's type winning", async () => {
    const dup = await makeEntity(campaignId, "Shell NPC", "NPC");
    const surv = await makeEntity(campaignId, "Real PC", "PC");

    const res = await combine(dup, surv);
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("PC");

    const survivorRow = await prisma.campaignEntity.findUniqueOrThrow({ where: { id: surv } });
    expect(survivorRow.type).toBe("PC");
  });

  it("deletes the duplicate row cleanly, leaving no dangling refs", async () => {
    const dup = await makeEntity(campaignId, "lili I");
    const surv = await makeEntity(campaignId, "Lili I");
    await seedEntry({ body: `@[${dup}]`, entityIds: [dup] });

    const res = await combine(dup, surv);
    expect(res.status).toBe(200);

    const gone = await prisma.campaignEntity.findUnique({ where: { id: dup } });
    expect(gone).toBeNull();
    const danglingRefs = await prisma.journalEntryRef.findMany({ where: { entityId: dup } });
    expect(danglingRefs).toHaveLength(0);
  });

  describe("portrait cleanup (#1942)", () => {
    beforeAll(async () => {
      // Same isolated fs-driven blob store as entities.test.ts's portrait suite.
      vi.stubEnv("BLOB_STORE_DRIVER", "fs");
      vi.stubEnv("BLOB_FS_DIR", await mkdtemp(path.join(os.tmpdir(), "entity-combine-portrait-test-")));
      __resetBlobStoreForTests();
    });

    afterAll(() => {
      vi.unstubAllEnvs();
      __resetBlobStoreForTests();
    });

    async function pngFixture(): Promise<Buffer> {
      return sharp({ create: { width: 8, height: 8, channels: 4, background: "#1a8b2a" } })
        .png()
        .toBuffer();
    }

    it("deletes the duplicate's portrait blob after combining, exactly like entity delete", async () => {
      const dup = await makeEntity(campaignId, "lili Portrait");
      const surv = await makeEntity(campaignId, "Lili Portrait");

      const uploaded = await supertest(app)
        .post(`/api/campaigns/${campaignId}/entities/${dup}/portrait`)
        .set("Cookie", cookieOwner)
        .attach(PORTRAIT_FIELD, await pngFixture(), { filename: "upload.png", contentType: "image/png" });
      expect(uploaded.status).toBe(200);
      const key = (
        await prisma.campaignEntity.findUniqueOrThrow({ where: { id: dup }, select: { portraitKey: true } })
      ).portraitKey as string;
      expect(await createBlobStore().exists(key)).toBe(true);

      const res = await combine(dup, surv);
      expect(res.status).toBe(200);

      expect(await createBlobStore().exists(key)).toBe(false);
    });
  });
});
