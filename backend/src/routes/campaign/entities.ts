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

export const entitiesRouter = Router();

// portraitKey never reaches the wire; null (not undefined) when unset, matching every existing read site.
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

// Matches in memory on name, aliases, and notes: the campaign-scoped volume is small (#839).
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
      // itemId (#1942): the combine survivor picker (#1943) can't warn about a transfer it can't see otherwise.
      itemLink: { select: { itemId: true } },
    },
    orderBy: { name: "asc" },
  });
  // Flatten to characterId/itemId — never the nested relation objects, on the wire.
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

// Registered before the generic :entityId routes so /activity can't be shadowed.
entitiesRouter.get("/campaigns/:id/entities/activity", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");
  const limit = parseLimit(req.query.limit, 20);
  res.json(
    await buildEntityActivityFeed(prisma, req.params.id, req.user!.id, role === "OWNER", limit),
  );
});

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

// Registered before the generic :entityId routes so /merges can't be shadowed.
entitiesRouter.get("/campaigns/:id/entities/merges", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");
  res.json(await listVisibleMerges(prisma, req.params.id, role === "OWNER"));
});

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

// Returns the ok result, or undefined when the error response was already written.
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

entitiesRouter.post("/campaigns/:id/entities/merges/:mergeId/execute", async (req, res) => {
  const result = await runOwnerMergeOp(req, res, "Only the campaign owner may execute a merge", (cid, mid) =>
    executeMerge(prisma, cid, mid),
  );
  if (result) res.json(result.merge);
});

entitiesRouter.delete("/campaigns/:id/entities/merges/:mergeId", async (req, res) => {
  const result = await runOwnerMergeOp(req, res, "Only the campaign owner may unmerge entities", (cid, mid) =>
    deleteMerge(prisma, cid, mid),
  );
  if (result) res.status(204).end();
});

// Registered before the generic :entityId routes so /combine can't be shadowed.
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

// Reads 404 a HIDDEN entity via findViewableEntity so this endpoint can't leak the existence of DM prep.
async function storedEntityPortraitKey(entityId: string): Promise<string | null> {
  const { portraitKey } = await prisma.campaignEntity.findUniqueOrThrow({
    where: { id: entityId },
    select: { portraitKey: true },
  });
  return portraitKey;
}

// Previous key is read before the swap so a crash between steps leaves at worst an orphaned blob, never a dangling key.
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

// Runs BEFORE portraitMultipart, so an unauthorized caller never makes the server buffer a multi-megabyte body.
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
    // A fresh uuid per upload versions the wire URL (toWireEntity's ?v=), making the immutable cache header safe.
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

// Idempotent: removing an absent portrait is a no-op 200, returning the serialized wire entity either way.
entitiesRouter.delete("/campaigns/:id/entities/:entityId/portrait", async (req, res) => {
  await assertOwnedEntityForPortraitWrite(
    req.user!.id,
    req.params.id,
    req.params.entityId,
    "Only the campaign owner may remove entity portraits",
  );

  await swapEntityPortraitKey(res, req.params.entityId, null);
});

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
