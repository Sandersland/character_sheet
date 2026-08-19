import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  ENTITY_TYPES,
  combineEntitiesSchema,
  createEntitySchema,
  updateEntitySchema,
} from "@character-sheet/contracts";

import { assertCampaignMembership, assertCampaignOwner } from "@/lib/auth/access.js";
import { NotFoundError } from "@/lib/auth/errors.js";
import { matchEntityQuery } from "@/lib/activity/entity-stats.js";
import {
  buildEntityActivityFeed,
  buildEntityBacklinks,
  buildEntityConnections,
  combineEntities,
  deleteMerge,
  executeMerge,
  findViewableEntity,
  listVisibleMerges,
  prepareMerge,
  withEntityStats,
} from "@/lib/campaign/entities.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import { prisma } from "@/lib/core/prisma.js";
import { getBlobStore } from "@/lib/storage/index.js";
import { deletePortraitBlobBestEffort, portraitKeyVersion } from "@/lib/storage/portrait-blob.js";
import { PORTRAIT_FIELD, portraitMultipart, sendStoredPortrait } from "@/lib/storage/portrait-http.js";
import { PORTRAIT_CONTENT_TYPE, reencodePortrait } from "@/lib/storage/portrait-image.js";

// Campaign entity registry (#248): the shared wiki of NPCs/locations/factions/
// items/PCs a table tags from journal notes. Plain-REST (like campaigns.ts):
// no audit log, no transaction-op pattern. Every route gates on
// assertCampaignMembership; DELETE, visibility changes, and portrait writes
// (#1617) require the OWNER role.
// Visibility (#379): non-owners only ever see REVEALED entities (list, detail via
// list, backlinks); HIDDEN entities are the owner's private prep.

export const entitiesRouter = Router();

// ENTITY_TYPES/VISIBILITIES and createEntitySchema/updateEntitySchema live in
// @character-sheet/contracts (#1394) — this file's own non-schema uses below
// (parseEntityType, the wire-type union) read the same tuples rather than a
// second local copy.

// Wire serializer (#1617): strips the storage key — server-internal, never on
// the wire — and derives the versioned portrait URL from it, mirroring
// derivePortraitUrl for characters. `null` (not undefined) when unset, the
// pre-#1617 wire shape every read site already consumes.
function toWireEntity<T extends { id: string; campaignId: string; portraitKey: string | null }>({
  portraitKey,
  ...entity
}: T) {
  return {
    ...entity,
    portraitUrl: portraitKey
      ? `/api/campaigns/${entity.campaignId}/entities/${entity.id}/portrait?v=${portraitKeyVersion(portraitKey)}`
      : null,
  };
}

function parseLimit(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 50) : fallback;
}

// Invalid or absent ?type= means "all types".
function parseEntityType(raw: unknown): (typeof ENTITY_TYPES)[number] | undefined {
  return (ENTITY_TYPES as readonly string[]).includes(raw as string)
    ? (raw as (typeof ENTITY_TYPES)[number])
    : undefined;
}

/**
 * GET /api/campaigns/:id/entities?q=&type=&include=stats
 * List/search the campaign's entities. The campaign-scoped volume is small, so
 * we fetch (optionally narrowed by a valid type) and match in memory on name,
 * aliases, and notes (#839), labeling each hit's field. An invalid type is
 * ignored. ?include=stats attaches derived mention stats (computed at read; a
 * fixed number of queries regardless of result size).
 */
entitiesRouter.get("/campaigns/:id/entities", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");
  const isOwner = role === "OWNER";

  const type = parseEntityType(req.query.type);

  const rows = await prisma.campaignEntity.findMany({
    where: {
      campaignId: req.params.id,
      ...(type ? { type } : {}),
      // Non-owners see only revealed entities (#379); the owner sees all.
      ...(isOwner ? {} : { visibility: "REVEALED" }),
    },
    include: {
      characterLink: { select: { characterId: true } },
      // itemId (#1942): otherwise an entity's item-link status is invisible
      // on the wire, so the combine dialog/survivor picker (#1943) can't
      // truthfully warn about a transfer it can't see.
      itemLink: { select: { itemId: true } },
    },
    orderBy: { name: "asc" },
  });
  // Flatten the PC/item links (#842/#1942): characterId/itemId, never the
  // nested relation objects.
  const entities = rows.map(({ characterLink, itemLink, ...e }) => ({
    ...toWireEntity(e),
    characterId: characterLink?.characterId ?? null,
    itemId: itemLink?.itemId ?? null,
  }));

  const q = typeof req.query.q === "string" ? req.query.q : "";
  const matched = q
    ? entities.flatMap((e) => {
        const matchedIn = matchEntityQuery(e, q);
        return matchedIn ? [{ ...e, matchedIn }] : [];
      })
    : entities;

  const includeStats =
    typeof req.query.include === "string" && req.query.include.split(",").includes("stats");
  if (!includeStats) {
    res.json(matched);
    return;
  }

  res.json(await withEntityStats(prisma, req.params.id, req.user!.id, isOwner, matched));
});

/**
 * GET /api/campaigns/:id/entities/activity
 * Campaign-wide Codex activity (#839). Registered before the generic :entityId
 * routes so the /activity segment can't be shadowed.
 */
entitiesRouter.get("/campaigns/:id/entities/activity", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");
  const limit = parseLimit(req.query.limit, 20);
  res.json(
    await buildEntityActivityFeed(prisma, req.params.id, req.user!.id, role === "OWNER", limit),
  );
});

/**
 * POST /api/campaigns/:id/entities
 * Create an entity. Any member may create.
 */
entitiesRouter.post("/campaigns/:id/entities", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "edit");

  const data = parseBodyOr400(createEntitySchema, req.body, res);
  if (data === undefined) return;
  // Setting visibility is an owner-only act (#379); a player creates REVEALED.
  if (data.visibility !== undefined && role !== "OWNER") {
    res.status(403).json({ error: "Only the campaign owner may set entity visibility" });
    return;
  }

  const entity = await prisma.campaignEntity.create({
    data: {
      campaignId: req.params.id,
      type: data.type,
      name: data.name,
      aliases: data.aliases ?? [],
      notes: data.notes ?? null,
      visibility: data.visibility ?? "REVEALED",
    },
  });

  res.status(201).json(toWireEntity(entity));
});

const prepareMergeSchema = z
  .object({
    mergedEntityId: z.string().uuid(),
    survivorEntityId: z.string().uuid(),
    note: z.string().optional(),
  })
  .strict();

/**
 * Entity identity merges (#387): owner-only "revealed to be" links. PREPARED is
 * the DM's secret prep — scrubbed from every non-owner payload; EXECUTED is the
 * public reveal (auto-reveals a HIDDEN survivor). Chains resolve transitively via
 * lib/entity-merges. Registered before the generic :entityId routes so the
 * /merges segment can't be shadowed.
 *
 * GET list — owner sees all; non-owner scrubbing lives in listVisibleMerges.
 */
entitiesRouter.get("/campaigns/:id/entities/merges", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");
  res.json(await listVisibleMerges(prisma, req.params.id, role === "OWNER"));
});

// POST prepare — OWNER only.
entitiesRouter.post("/campaigns/:id/entities/merges", async (req, res) => {
  await assertCampaignOwner(
    prisma,
    req.user!.id,
    req.params.id,
    "edit",
    "Only the campaign owner may merge entities",
  );

  const parsed = parseBodyOr400(prepareMergeSchema, req.body, res);
  if (parsed === undefined) return;

  const result = await prepareMerge(prisma, req.params.id, parsed);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json(result.merge);
});

// OWNER-gated merge-lifecycle step shared by execute and unmerge: assert the
// role, run the op, unwrap the { ok: false } error shape. Returns the ok
// result, or undefined when the error response was already written.
async function runOwnerMergeOp<T extends { ok: true } | { ok: false; status: number; error: string }>(
  req: Request<{ id: string; mergeId: string }>,
  res: Response,
  forbiddenMessage: string,
  op: (campaignId: string, mergeId: string) => Promise<T>,
): Promise<Extract<T, { ok: true }> | undefined> {
  await assertCampaignOwner(prisma, req.user!.id, req.params.id, "edit", forbiddenMessage);
  const result = await op(req.params.id, req.params.mergeId);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return undefined;
  }
  return result as Extract<T, { ok: true }>;
}

// POST execute — OWNER only.
entitiesRouter.post("/campaigns/:id/entities/merges/:mergeId/execute", async (req, res) => {
  const result = await runOwnerMergeOp(req, res, "Only the campaign owner may execute a merge", (cid, mid) =>
    executeMerge(prisma, cid, mid),
  );
  if (result) res.json(result.merge);
});

// DELETE unmerge — OWNER only.
entitiesRouter.delete("/campaigns/:id/entities/merges/:mergeId", async (req, res) => {
  const result = await runOwnerMergeOp(req, res, "Only the campaign owner may unmerge entities", (cid, mid) =>
    deleteMerge(prisma, cid, mid),
  );
  if (result) res.status(204).end();
});

/**
 * POST /api/campaigns/:id/entities/combine
 * Destructive typo-dedup (#1942), the sibling of /merges above: absorbs
 * every body.loserEntityIds duplicate into body.survivorEntityId in ONE
 * transaction, atomically — mention tokens rewritten, merge chains
 * re-pointed, character/item links moved, then every loser deleted. A single
 * combine is a 1-length loserEntityIds array, not a separate route. OWNER
 * only. No :entityId param (unlike the merge lifecycle above) since a batch
 * doesn't have a single subject; registered before the generic :entityId
 * routes below so the /combine segment can't be shadowed.
 */
entitiesRouter.post("/campaigns/:id/entities/combine", async (req, res) => {
  await assertCampaignOwner(
    prisma,
    req.user!.id,
    req.params.id,
    "edit",
    "Only the campaign owner may combine entities",
  );

  const data = parseBodyOr400(combineEntitiesSchema, req.body, res);
  if (data === undefined) return;

  const result = await combineEntities(
    prisma,
    req.params.id,
    data.loserEntityIds,
    data.survivorEntityId,
  );
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  const { characterLink, itemLink, ...entity } = result.entity;
  res.json({
    ...toWireEntity(entity),
    characterId: characterLink?.characterId ?? null,
    itemId: itemLink?.itemId ?? null,
  });
});

/**
 * PATCH /api/campaigns/:id/entities/:entityId
 * Edit an entity. Any member; 404 if the entity isn't in this campaign.
 */
entitiesRouter.patch("/campaigns/:id/entities/:entityId", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "edit");

  const data = parseBodyOr400(updateEntitySchema, req.body, res);
  if (data === undefined) return;

  // Changing visibility is owner-only (#379); basic-field edits stay member-level.
  if (data.visibility !== undefined && role !== "OWNER") {
    res.status(403).json({ error: "Only the campaign owner may change entity visibility" });
    return;
  }

  const existing = await prisma.campaignEntity.findUnique({
    where: { id: req.params.entityId },
    select: { id: true, campaignId: true, visibility: true },
  });
  // A hidden entity is invisible to non-owners: 404 as if it weren't there.
  if (
    !existing ||
    existing.campaignId !== req.params.id ||
    (existing.visibility === "HIDDEN" && role !== "OWNER")
  ) {
    res.status(404).json({ error: "Entity not found" });
    return;
  }

  const entity = await prisma.campaignEntity.update({
    where: { id: req.params.entityId },
    data,
  });

  res.json(toWireEntity(entity));
});

/**
 * DELETE /api/campaigns/:id/entities/:entityId
 * Delete an entity (cascades its refs). OWNER only.
 */
entitiesRouter.delete("/campaigns/:id/entities/:entityId", async (req, res) => {
  await assertCampaignOwner(
    prisma,
    req.user!.id,
    req.params.id,
    "edit",
    "Only the campaign owner may delete entities",
  );

  const existing = await prisma.campaignEntity.findUnique({
    where: { id: req.params.entityId },
    select: { id: true, campaignId: true, portraitKey: true },
  });
  if (!existing || existing.campaignId !== req.params.id) {
    res.status(404).json({ error: "Entity not found" });
    return;
  }

  await prisma.campaignEntity.delete({ where: { id: req.params.entityId } });
  await deletePortraitBlobBestEffort(existing.portraitKey);
  res.status(204).end();
});

// Entity portraits (#1617): the same pipeline as the character portraitRouter
// — multipart re-encode → blob store → portraitKey swap, streamed back under
// the immutable cache contract. Writes are OWNER-only ("entity owner" means
// the campaign OWNER role; CampaignEntity has no creator column), which
// deliberately narrows #844's any-member portrait writes. Reads are
// member-level, but a HIDDEN entity 404s for non-owners via findViewableEntity
// so this endpoint can't leak the existence (or image) of DM prep.

async function storedEntityPortraitKey(entityId: string): Promise<string | null> {
  const { portraitKey } = await prisma.campaignEntity.findUniqueOrThrow({
    where: { id: entityId },
    select: { portraitKey: true },
  });
  return portraitKey;
}

// Key swap + superseded-blob cleanup + wire response, shared by the portrait
// POST (fresh key) and DELETE (null). The previous key is read before the
// swap so the old blob can be best-effort deleted after the write commits —
// a crash between steps leaves at worst an orphaned blob, never a dangling key.
async function swapEntityPortraitKey(
  res: Response,
  entityId: string,
  key: string | null,
): Promise<void> {
  const previousKey = await storedEntityPortraitKey(entityId);
  const updated = await prisma.campaignEntity.update({
    where: { id: entityId },
    data: { portraitKey: key },
  });
  await deletePortraitBlobBestEffort(previousKey);
  res.json(toWireEntity(updated));
}

// Owner gate + entity-in-campaign 404 run BEFORE portraitMultipart, so an
// unauthorized caller never makes the server buffer a multi-megabyte body.
async function assertOwnedEntityForPortraitWrite(
  userId: string,
  campaignId: string,
  entityId: string,
  forbiddenMessage: string,
): Promise<void> {
  await assertCampaignOwner(prisma, userId, campaignId, "edit", forbiddenMessage);
  const existing = await prisma.campaignEntity.findUnique({
    where: { id: entityId },
    select: { campaignId: true },
  });
  if (!existing || existing.campaignId !== campaignId) {
    throw new NotFoundError("Entity not found");
  }
}

entitiesRouter.post(
  "/campaigns/:id/entities/:entityId/portrait",
  async (req, _res, next) => {
    await assertOwnedEntityForPortraitWrite(
      req.user!.id,
      req.params.id,
      req.params.entityId,
      "Only the campaign owner may set entity portraits",
    );
    next();
  },
  portraitMultipart,
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: `Missing multipart file field "${PORTRAIT_FIELD}"` });
      return;
    }

    const entityId = req.params.entityId;
    const webp = await reencodePortrait(req.file.buffer, req.file.mimetype);
    // A fresh uuid per upload is what versions the wire URL (toWireEntity
    // reads it back as ?v=), making the immutable cache header safe.
    const key = `portraits/entities/${entityId}/${randomUUID()}.webp`;
    await getBlobStore().put(key, webp, { contentType: PORTRAIT_CONTENT_TYPE });
    await swapEntityPortraitKey(res, entityId, key);
  },
);

// fallow-ignore-next-line code-duplication -- pre-existing view+404 guard shared with the backlinks GET below; surfaced only because #1942 touched this file, not introduced by it
entitiesRouter.get("/campaigns/:id/entities/:entityId/portrait", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");

  const entity = await findViewableEntity(prisma, req.params.entityId, req.params.id, role === "OWNER");
  if (!entity) throw new NotFoundError("Entity not found");

  await sendStoredPortrait(res, entity.portraitKey);
});

// Idempotent: removing an absent portrait is a no-op 200 — the response is
// the serialized wire entity either way, like every other entity mutation.
entitiesRouter.delete("/campaigns/:id/entities/:entityId/portrait", async (req, res) => {
  await assertOwnedEntityForPortraitWrite(
    req.user!.id,
    req.params.id,
    req.params.entityId,
    "Only the campaign owner may remove entity portraits",
  );

  await swapEntityPortraitKey(res, req.params.entityId, null);
});

/**
 * GET /api/campaigns/:id/entities/:entityId/backlinks
 * Notes that @-tag this entity, newest-first. This is THE sharing surface
 * (#838): the caller's own entries plus other members' CAMPAIGN-visible ones.
 * A PRIVATE note is visible only to its author — no owner/DM bypass.
 */
// fallow-ignore-next-line code-duplication -- pre-existing view+404 guard shared with the portrait GET above; surfaced only because #1942 touched this file, not introduced by it
entitiesRouter.get("/campaigns/:id/entities/:entityId/backlinks", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");

  const entity = await findViewableEntity(prisma, req.params.entityId, req.params.id, role === "OWNER");
  if (!entity) {
    res.status(404).json({ error: "Entity not found" });
    return;
  }

  res.json(
    await buildEntityBacklinks(
      prisma,
      req.params.id,
      req.user!.id,
      role === "OWNER",
      req.params.entityId,
    ),
  );
});

/**
 * GET /api/campaigns/:id/entities/:entityId/connections
 * Co-mention graph (#839): entities sharing a visible entry with this one,
 * merge-resolved to survivors, counted by distinct entries, sorted desc.
 */
entitiesRouter.get("/campaigns/:id/entities/:entityId/connections", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");
  const isOwner = role === "OWNER";

  const target = await findViewableEntity(prisma, req.params.entityId, req.params.id, isOwner);
  if (!target) {
    res.status(404).json({ error: "Entity not found" });
    return;
  }

  const limit = parseLimit(req.query.limit, 10);

  res.json(
    await buildEntityConnections(prisma, req.params.id, req.user!.id, isOwner, target.id, limit),
  );
});
