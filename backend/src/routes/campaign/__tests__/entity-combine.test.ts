import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import supertest from "supertest";

import { Prisma } from "@/generated/prisma/client.js";
import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { createTestCharacter } from "@/test-support/character.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { __resetBlobStoreForTests, createBlobStore } from "@/lib/storage/index.js";
import { PORTRAIT_FIELD } from "@/lib/storage/portrait-http.js";
import * as entityMergesModule from "@/lib/activity/entity-merges.js";

// Unique fixture ids for this file (parallel-safe on the shared dev DB).
const OWNER = "combine-owner";
const PLAYER = "combine-player";
const CHAR_OWNER = "combine-char-owner";
const CHAR_PLAYER = "combine-char-player";

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

  // The atomic batch endpoint (#1942 round 3): POST /entities/combine with
  // { survivorEntityId, loserEntityIds }. `combine` is the 1-length-array
  // convenience wrapper every pre-existing single-duplicate test still uses.
  async function combineBatch(loserEntityIds: string[], survivorEntityId: string, cookie = cookieOwner) {
    return supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/combine`)
      .set("Cookie", cookie)
      .send({ survivorEntityId, loserEntityIds });
  }

  async function combine(entityId: string, survivorEntityId: string, cookie = cookieOwner) {
    return combineBatch([entityId], survivorEntityId, cookie);
  }

  beforeAll(async () => {
    await ensureTestOwner(OWNER);
    await ensureTestOwner(PLAYER);
    cookieOwner = await authCookie(OWNER);
    cookiePlayer = await authCookie(PLAYER);

    const created = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieOwner)
      .send({ name: "Combine Campaign" });
    campaignId = created.body.id;
    const code = created.body.inviteCode as string;
    await supertest(app).post("/api/campaigns/join").set("Cookie", cookiePlayer).send({ inviteCode: code });

    await prisma.character.deleteMany({ where: { id: { in: [CHAR_OWNER, CHAR_PLAYER] } } });
    await createTestCharacter(OWNER, { id: CHAR_OWNER, name: "Combine Char Owner", campaignId });
    await createTestCharacter(PLAYER, { id: CHAR_PLAYER, name: "Combine Char Player", campaignId });

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

  it("400s an empty loserEntityIds array", async () => {
    const surv = await makeEntity(campaignId, "Empty Batch Survivor");
    const res = await combineBatch([], surv);
    expect(res.status).toBe(400);
  });

  it("400s loserEntityIds containing a duplicate id", async () => {
    const dup = await makeEntity(campaignId, "lili Dup Ids");
    const surv = await makeEntity(campaignId, "Lili Dup Ids Survivor");
    const res = await combineBatch([dup, dup], surv);
    expect(res.status).toBe(400);
  });

  it("400s a non-uuid survivorEntityId or loserEntityIds element", async () => {
    // uuid() at the schema boundary (#1942) makes CampaignEntity.id's
    // "plain String column" hazard unreachable from a real request — the
    // pattern-escaping in mentionTokenPattern is defense in depth beyond this.
    const dup = await makeEntity(campaignId, "lili Boundary");
    const badSurvivor = await combineBatch([dup], "not-a-uuid");
    expect(badSurvivor.status).toBe(400);
    const badLoser = await combineBatch(["not-a-uuid"], dup);
    expect(badLoser.status).toBe(400);
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
    // hidden-entity guard in syncEntryRefs (#379) suppresses the hidden ref
    // here, leaving the token as unbacked text.
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

  it("rewrites the body AND moves the ref for an entry authored by a character who has since left the campaign", async () => {
    await prisma.character.deleteMany({ where: { id: "combine-leaver-char" } });
    await createTestCharacter(OWNER, { id: "combine-leaver-char", campaignId });

    const dup = await makeEntity(campaignId, "lili Leaver");
    const surv = await makeEntity(campaignId, "Lili Leaver");

    const entryId = await seedEntry({
      characterId: "combine-leaver-char",
      body: `@[${dup}] before I left.`,
      entityIds: [dup],
    });

    // The character leaves the campaign (campaignId nulled). A prior version
    // scoped the body rewrite by the AUTHOR's current character.campaignId —
    // this entry's join would then miss it while the ref move (unscoped,
    // keyed only on entityId) still repointed the ref, leaving a dangling
    // @[dupId] token behind a moved ref. The fix scopes by the token itself
    // (duplicateId is a globally-unique CampaignEntity id), so leaving the
    // campaign can't desync body from ref.
    await prisma.character.update({ where: { id: "combine-leaver-char" }, data: { campaignId: null } });

    const res = await combine(dup, surv);
    expect(res.status).toBe(200);

    const after = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(after.body).toBe(`@[${surv}] before I left.`);

    const refs = await prisma.journalEntryRef.findMany({ where: { entryId } });
    expect(refs.map((r) => r.entityId)).toEqual([surv]);

    await prisma.character.deleteMany({ where: { id: "combine-leaver-char" } });
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

  // The realistic concurrent-combine race: the survivor row a caller-visible
  // read confirmed present gets deleted by someone else before the write that
  // references it lands, raising a Postgres foreign-key violation (P2003) —
  // e.g. journalEntryRef.updateMany's FK to CampaignEntity. wouldCreateCycle
  // only runs mid-transaction when a merge chain needs re-pointing, so it's a
  // convenient, already-exported hook to force a real PrismaClientKnownRequestError
  // out of the SAME transaction combineEntities runs, without mocking Prisma itself.
  it("409s (not 500) on a mid-transaction foreign-key race (P2003)", async () => {
    const a = await makeEntity(campaignId, "A P2003");
    const dup = await makeEntity(campaignId, "lili P2003");
    const surv = await makeEntity(campaignId, "Lili P2003");

    const prep = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: a, survivorEntityId: dup });
    expect(prep.status).toBe(201);
    const mergeId = prep.body.id as string;

    const spy = vi.spyOn(entityMergesModule, "wouldCreateCycle").mockImplementationOnce(() => {
      throw new Prisma.PrismaClientKnownRequestError("Foreign key constraint violated", {
        code: "P2003",
        clientVersion: "test",
      });
    });
    try {
      const res = await combine(dup, surv);
      expect(res.status).toBe(409);
    } finally {
      spy.mockRestore();
    }

    // The transaction rolled back — the merge row's original shape survives.
    const after = await prisma.campaignEntityMerge.findUniqueOrThrow({ where: { id: mergeId } });
    expect(after.mergedEntityId).toBe(a);
    expect(after.survivorEntityId).toBe(dup);
  });

  // The mechanism, proven deterministically. Hold a row lock on ONLY the
  // SURVIVOR — not the loser — then fire a real combine(loser, survivor).
  // This isolates exactly what lockCombineTargets adds: the loser's own
  // eventual DELETE would naturally contend with a lock held on the LOSER
  // (any transaction's delete does that, fix or no fix — not a useful
  // discriminator), but nothing else in the combine ever writes the
  // SURVIVOR row. Only an explicit up-front SELECT ... FOR UPDATE on the
  // survivor too makes this block; a naive findMany-based guard reads
  // straight past another transaction's row lock under READ COMMITTED and
  // completes unaffected. Timing-luck tests (two Promise.all'd combine()
  // calls with no controlled hold) turned out NOT to discriminate reliably
  // in this environment — fast local Postgres often finishes one request's
  // whole transaction before the other's guard read even starts, passing
  // either way — so this test controls the interleaving directly instead.
  it("blocks a combine on a row lock already held for its survivor alone (lockCombineTargets)", async () => {
    const loser = await makeEntity(campaignId, "Lock Hold Loser");
    const survivor = await makeEntity(campaignId, "Lock Hold Survivor");

    let lockAcquired = false;
    let releaseLock!: () => void;
    const heldUntilReleased = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const holderTxn = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CampaignEntity" WHERE id = ${survivor} FOR UPDATE`;
      lockAcquired = true;
      await heldUntilReleased;
    });

    for (let i = 0; i < 50 && !lockAcquired; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(lockAcquired).toBe(true);

    const combinePromise = combine(loser, survivor);
    try {
      const raceResult = await Promise.race([
        combinePromise.then(() => "resolved" as const),
        new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 200)),
      ]);
      // Still blocked on the held survivor-only row lock 200ms later — not
      // raced past it, even though nothing else in combine writes that row.
      expect(raceResult).toBe("pending");
    } finally {
      releaseLock();
      await holderTxn;
    }

    const res = await combinePromise;
    expect(res.status).toBe(200);
  });

  // Supplementary real-usage-shape check (kept alongside the deterministic
  // test above, which is what actually proves the lock blocks): two genuinely
  // concurrent requests, neither entity carrying a ref or link (so under the
  // pre-fix code no Prisma error code would ever fire either way). Asserts
  // the INVARIANT the lock exists to protect — never both succeeding, never
  // both entities gone — even though this shape alone can't be trusted to
  // discriminate the fix on every environment/timing.
  it("never lets two concurrent inverse combines (A absorbs B; B absorbs A) both commit and delete both entities", async () => {
    const a = await makeEntity(campaignId, "Inverse Race A");
    const b = await makeEntity(campaignId, "Inverse Race B");

    const [resAintoB, resBintoA] = await Promise.all([combine(a, b), combine(b, a)]);

    const stillA = await prisma.campaignEntity.findUnique({ where: { id: a } });
    const stillB = await prisma.campaignEntity.findUnique({ where: { id: b } });
    const survivingCount = [stillA, stillB].filter((row) => row !== null).length;
    // Never both gone (the bug this guards against) and never both present
    // (combine did nothing) — exactly one direction's outcome held.
    expect(survivingCount).toBe(1);
    expect([resAintoB.status, resBintoA.status].sort()).toEqual([200, 404]);
  });

  it("drops a PREPARED merge row that would become self-referential when re-pointed", async () => {
    const dup = await makeEntity(campaignId, "lili F");
    const surv = await makeEntity(campaignId, "Lili F");

    // "Lili F is secretly lili F" — survivor merged into the duplicate. Still
    // PREPARED (never executed), so it's still secret DM prep — dies silently.
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

  it("409s combining when a self-referential re-point would destroy an EXECUTED (publicly revealed) merge", async () => {
    const dup = await makeEntity(campaignId, "lili F Exec");
    const surv = await makeEntity(campaignId, "Lili F Exec");

    // Same shape as the PREPARED case above, but EXECUTED: a public reveal
    // players may already know, so it can't just vanish under a 200.
    const prep = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges`)
      .set("Cookie", cookieOwner)
      .send({ mergedEntityId: surv, survivorEntityId: dup });
    expect(prep.status).toBe(201);
    const mergeId = prep.body.id as string;
    const exec = await supertest(app)
      .post(`/api/campaigns/${campaignId}/entities/merges/${mergeId}/execute`)
      .set("Cookie", cookieOwner);
    expect(exec.status).toBe(200);

    const res = await combine(dup, surv);
    expect(res.status).toBe(409);

    // Nothing touched: the reveal survives, and the duplicate isn't deleted.
    const stillMerge = await prisma.campaignEntityMerge.findUnique({ where: { id: mergeId } });
    expect(stillMerge).not.toBeNull();
    const stillDup = await prisma.campaignEntity.findUnique({ where: { id: dup } });
    expect(stillDup).not.toBeNull();
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
    await prisma.character.deleteMany({ where: { id: "combine-link-char-1" } });
    await createTestCharacter(OWNER, { id: "combine-link-char-1" });
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
    await prisma.character.deleteMany({
      where: { id: { in: ["combine-link-char-2a", "combine-link-char-2b"] } },
    });
    await createTestCharacter(OWNER, { id: "combine-link-char-2a" });
    await createTestCharacter(OWNER, { id: "combine-link-char-2b" });
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

  it("409s moving a character link onto a non-PC survivor", async () => {
    await prisma.character.deleteMany({ where: { id: "combine-link-char-3" } });
    await createTestCharacter(OWNER, { id: "combine-link-char-3" });
    const attach = await supertest(app)
      .post(`/api/campaigns/${campaignId}/characters`)
      .set("Cookie", cookieOwner)
      .send({ characterId: "combine-link-char-3" });
    expect(attach.status).toBe(200);

    const linkRow = await prisma.campaignCharacterLink.findUniqueOrThrow({
      where: { characterId: "combine-link-char-3" },
    });
    const dupPcId = linkRow.campaignEntityId;
    const surv = await makeEntity(campaignId, "Not A PC", "NPC");

    const res = await combine(dupPcId, surv);
    expect(res.status).toBe(409);

    const stillLinked = await prisma.campaignCharacterLink.findUniqueOrThrow({
      where: { characterId: "combine-link-char-3" },
    });
    expect(stillLinked.campaignEntityId).toBe(dupPcId);
    const stillDup = await prisma.campaignEntity.findUnique({ where: { id: dupPcId } });
    expect(stillDup).not.toBeNull();

    await prisma.character.deleteMany({ where: { id: "combine-link-char-3" } });
  });

  it("409s moving a character link onto a PC survivor that also fronts a campaign item", async () => {
    await prisma.character.deleteMany({ where: { id: "combine-link-char-4" } });
    await createTestCharacter(OWNER, { id: "combine-link-char-4" });
    const attach = await supertest(app)
      .post(`/api/campaigns/${campaignId}/characters`)
      .set("Cookie", cookieOwner)
      .send({ characterId: "combine-link-char-4" });
    expect(attach.status).toBe(200);

    const linkRow = await prisma.campaignCharacterLink.findUniqueOrThrow({
      where: { characterId: "combine-link-char-4" },
    });
    const dupPcId = linkRow.campaignEntityId;

    // A PC-typed survivor that ALSO fronts a campaign item — not something the
    // UI would normally construct, but the guard must hold regardless: a
    // later item delete cascades away this entity, taking the character link
    // (and the player's own codex row) with it.
    const survEntity = await prisma.campaignEntity.create({
      data: { campaignId, type: "PC", name: "PC Fronting An Item" },
    });
    await prisma.item.create({
      data: {
        scope: "CAMPAIGN",
        scopeKey: `campaign:${campaignId}`,
        campaignId,
        name: "Item On A PC Entity",
        category: "gear",
        link: { create: { campaignEntityId: survEntity.id } },
      },
    });

    const res = await combine(dupPcId, survEntity.id);
    expect(res.status).toBe(409);

    const stillLinked = await prisma.campaignCharacterLink.findUniqueOrThrow({
      where: { characterId: "combine-link-char-4" },
    });
    expect(stillLinked.campaignEntityId).toBe(dupPcId);

    await prisma.character.deleteMany({ where: { id: "combine-link-char-4" } });
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

  it("moves an item link from an unlinked duplicate onto the survivor, surfacing itemId on the wire", async () => {
    const { entityId: dupItem, itemId } = await makeItemEntity("Dup Item");
    const surv = await makeEntity(campaignId, "Survivor Item", "ITEM");

    const res = await combine(dupItem, surv);
    expect(res.status).toBe(200);
    // itemId on the combine response (#1942): the codex/dialog can't warn
    // truthfully about an item-link transfer it can't observe on the wire.
    expect(res.body.itemId).toBe(itemId);

    const link = await prisma.campaignItemLink.findUniqueOrThrow({ where: { campaignEntityId: surv } });
    expect(link.campaignEntityId).toBe(surv);
  });

  it("surfaces itemId: null on the wire for an entity with no item link, and the real itemId for one that has it", async () => {
    const { entityId: itemEntityId, itemId } = await makeItemEntity("Wire Item Entity");
    const plain = await makeEntity(campaignId, "Wire Plain Entity");

    const list = await supertest(app)
      .get(`/api/campaigns/${campaignId}/entities`)
      .set("Cookie", cookieOwner);
    expect(list.status).toBe(200);
    const rows = list.body as { id: string; itemId: string | null }[];
    expect(rows.find((e) => e.id === itemEntityId)?.itemId).toBe(itemId);
    expect(rows.find((e) => e.id === plain)?.itemId).toBeNull();
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

  describe("atomic batch combine (#1942)", () => {
    it("combines multiple duplicates into one survivor in a single call, all mentions moved and all duplicates gone", async () => {
      const dupA = await makeEntity(campaignId, "lili Batch A");
      const dupB = await makeEntity(campaignId, "lili Batch B");
      const surv = await makeEntity(campaignId, "Lili Batch");

      const entryA = await seedEntry({ body: `@[${dupA}] said hi.`, entityIds: [dupA] });
      const entryB = await seedEntry({ body: `@[${dupB}] said hi too.`, entityIds: [dupB] });

      const res = await combineBatch([dupA, dupB], surv);
      expect(res.status).toBe(200);

      const afterA = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entryA } });
      const afterB = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entryB } });
      expect(afterA.body).toBe(`@[${surv}] said hi.`);
      expect(afterB.body).toBe(`@[${surv}] said hi too.`);

      const refs = await prisma.journalEntryRef.findMany({ where: { entryId: { in: [entryA, entryB] } } });
      expect(refs.map((r) => r.entityId)).toEqual([surv, surv]);

      expect(await prisma.campaignEntity.findUnique({ where: { id: dupA } })).toBeNull();
      expect(await prisma.campaignEntity.findUnique({ where: { id: dupB } })).toBeNull();
    });

    it("409s up front on a cross-loser link conflict, applying ZERO writes to any loser in the batch", async () => {
      await prisma.character.deleteMany({
        where: { id: { in: ["combine-batch-char-a", "combine-batch-char-b"] } },
      });
      await createTestCharacter(OWNER, { id: "combine-batch-char-a" });
      await createTestCharacter(OWNER, { id: "combine-batch-char-b" });
      await supertest(app)
        .post(`/api/campaigns/${campaignId}/characters`)
        .set("Cookie", cookieOwner)
        .send({ characterId: "combine-batch-char-a" });
      await supertest(app)
        .post(`/api/campaigns/${campaignId}/characters`)
        .set("Cookie", cookieOwner)
        .send({ characterId: "combine-batch-char-b" });
      const linkA = await prisma.campaignCharacterLink.findUniqueOrThrow({
        where: { characterId: "combine-batch-char-a" },
      });
      const linkB = await prisma.campaignCharacterLink.findUniqueOrThrow({
        where: { characterId: "combine-batch-char-b" },
      });

      const surv = await makeEntity(campaignId, "Batch Conflict Survivor", "PC");
      // A third, unrelated loser with its own mention — proves the guard
      // fires BEFORE any loser's own writes apply, not partway through.
      const dupC = await makeEntity(campaignId, "lili Batch C");
      const entryC = await seedEntry({ body: `@[${dupC}] noted.`, entityIds: [dupC] });

      const res = await combineBatch([linkA.campaignEntityId, linkB.campaignEntityId, dupC], surv);
      expect(res.status).toBe(409);

      const stillA = await prisma.campaignCharacterLink.findUniqueOrThrow({
        where: { characterId: "combine-batch-char-a" },
      });
      expect(stillA.campaignEntityId).toBe(linkA.campaignEntityId);
      const stillB = await prisma.campaignCharacterLink.findUniqueOrThrow({
        where: { characterId: "combine-batch-char-b" },
      });
      expect(stillB.campaignEntityId).toBe(linkB.campaignEntityId);
      expect(await prisma.campaignEntity.findUnique({ where: { id: linkA.campaignEntityId } })).not.toBeNull();
      expect(await prisma.campaignEntity.findUnique({ where: { id: linkB.campaignEntityId } })).not.toBeNull();
      expect(await prisma.campaignEntity.findUnique({ where: { id: dupC } })).not.toBeNull();

      const entryAfter = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entryC } });
      expect(entryAfter.body).toBe(`@[${dupC}] noted.`);
      const refsAfter = await prisma.journalEntryRef.findMany({ where: { entryId: entryC } });
      expect(refsAfter.map((r) => r.entityId)).toEqual([dupC]);

      await prisma.character.deleteMany({
        where: { id: { in: ["combine-batch-char-a", "combine-batch-char-b"] } },
      });
    });

    it("409s a cross-loser link conflict regardless of loserEntityIds order", async () => {
      await prisma.character.deleteMany({
        where: { id: { in: ["combine-order-char-a", "combine-order-char-b"] } },
      });
      await createTestCharacter(OWNER, { id: "combine-order-char-a" });
      await createTestCharacter(OWNER, { id: "combine-order-char-b" });
      await supertest(app)
        .post(`/api/campaigns/${campaignId}/characters`)
        .set("Cookie", cookieOwner)
        .send({ characterId: "combine-order-char-a" });
      await supertest(app)
        .post(`/api/campaigns/${campaignId}/characters`)
        .set("Cookie", cookieOwner)
        .send({ characterId: "combine-order-char-b" });
      const linkA = await prisma.campaignCharacterLink.findUniqueOrThrow({
        where: { characterId: "combine-order-char-a" },
      });
      const linkB = await prisma.campaignCharacterLink.findUniqueOrThrow({
        where: { characterId: "combine-order-char-b" },
      });
      const surv = await makeEntity(campaignId, "Order Conflict Survivor", "PC");

      const forward = await combineBatch([linkA.campaignEntityId, linkB.campaignEntityId], surv);
      expect(forward.status).toBe(409);
      const reverse = await combineBatch([linkB.campaignEntityId, linkA.campaignEntityId], surv);
      expect(reverse.status).toBe(409);

      await prisma.character.deleteMany({
        where: { id: { in: ["combine-order-char-a", "combine-order-char-b"] } },
      });
    });

    it("produces the same final state regardless of loserEntityIds order, for independent duplicates", async () => {
      const dupX = await makeEntity(campaignId, "lili Order X");
      const dupY = await makeEntity(campaignId, "lili Order Y");
      const survForward = await makeEntity(campaignId, "Order Survivor Forward");
      const entryXf = await seedEntry({ body: `@[${dupX}] forward.`, entityIds: [dupX] });
      const entryYf = await seedEntry({ body: `@[${dupY}] forward.`, entityIds: [dupY] });
      const resForward = await combineBatch([dupX, dupY], survForward);
      expect(resForward.status).toBe(200);

      const dupX2 = await makeEntity(campaignId, "lili Order X2");
      const dupY2 = await makeEntity(campaignId, "lili Order Y2");
      const survReverse = await makeEntity(campaignId, "Order Survivor Reverse");
      const entryXr = await seedEntry({ body: `@[${dupX2}] reverse.`, entityIds: [dupX2] });
      const entryYr = await seedEntry({ body: `@[${dupY2}] reverse.`, entityIds: [dupY2] });
      const resReverse = await combineBatch([dupY2, dupX2], survReverse);
      expect(resReverse.status).toBe(200);

      expect(await prisma.campaignEntity.findUnique({ where: { id: dupX } })).toBeNull();
      expect(await prisma.campaignEntity.findUnique({ where: { id: dupY } })).toBeNull();
      expect(await prisma.campaignEntity.findUnique({ where: { id: dupX2 } })).toBeNull();
      expect(await prisma.campaignEntity.findUnique({ where: { id: dupY2 } })).toBeNull();

      const forwardBodies = [
        (await prisma.journalEntry.findUniqueOrThrow({ where: { id: entryXf } })).body,
        (await prisma.journalEntry.findUniqueOrThrow({ where: { id: entryYf } })).body,
      ];
      const reverseBodies = [
        (await prisma.journalEntry.findUniqueOrThrow({ where: { id: entryXr } })).body,
        (await prisma.journalEntry.findUniqueOrThrow({ where: { id: entryYr } })).body,
      ];
      expect(forwardBodies).toEqual([`@[${survForward}] forward.`, `@[${survForward}] forward.`]);
      expect(reverseBodies).toEqual([`@[${survReverse}] reverse.`, `@[${survReverse}] reverse.`]);
    });
  });

  describe("portrait cleanup (#1942)", () => {
    beforeAll(async () => {
      // Isolated fs-driven blob store, the same __resetBlobStoreForTests/
      // createBlobStore setup the other entity-portrait tests use.
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
