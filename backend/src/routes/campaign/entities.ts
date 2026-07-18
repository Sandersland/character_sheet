import { Router } from "express";
import { z } from "zod";

import { assertCampaignMembership, assertCampaignOwner } from "@/lib/auth/access.js";
import { matchEntityQuery } from "@/lib/activity/entity-stats.js";
import {
  buildEntityActivityFeed,
  buildEntityBacklinks,
  buildEntityConnections,
  deleteMerge,
  executeMerge,
  findViewableEntity,
  listVisibleMerges,
  prepareMerge,
  withEntityStats,
} from "@/lib/campaign/entities.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import { prisma } from "@/lib/core/prisma.js";

// Campaign entity registry (#248): the shared wiki of NPCs/locations/factions/
// items/PCs a table tags from journal notes. Plain-REST (like campaigns.ts):
// no audit log, no transaction-op pattern. Every route gates on
// assertCampaignMembership; DELETE and visibility changes require the OWNER role.
// Visibility (#379): non-owners only ever see REVEALED entities (list, detail via
// list, backlinks); HIDDEN entities are the owner's private prep.

export const entitiesRouter = Router();

const ENTITY_TYPES = ["NPC", "LOCATION", "FACTION", "ITEM", "PC", "OTHER"] as const;

const VISIBILITIES = ["HIDDEN", "REVEALED"] as const;

const createEntitySchema = z
  .object({
    type: z.enum(ENTITY_TYPES),
    name: z.string().min(1),
    aliases: z.array(z.string()).optional(),
    notes: z.string().optional(),
    portraitUrl: z.url().nullable().optional(),
    // Owner-only (#379): a non-owner supplying this is rejected at the route.
    visibility: z.enum(VISIBILITIES).optional(),
  })
  .strict();

const updateEntitySchema = z
  .object({
    type: z.enum(ENTITY_TYPES),
    name: z.string().min(1),
    aliases: z.array(z.string()),
    notes: z.string().nullable(),
    portraitUrl: z.url().nullable(),
    // Owner-only (#379); presence in a non-owner PATCH is rejected at the route.
    visibility: z.enum(VISIBILITIES),
  })
  .partial()
  .strict();

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
    include: { characterLink: { select: { characterId: true } } },
    orderBy: { name: "asc" },
  });
  // Flatten the PC link (#842): characterId, never the nested relation object.
  const entities = rows.map(({ characterLink, ...e }) => ({
    ...e,
    characterId: characterLink?.characterId ?? null,
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
      portraitUrl: data.portraitUrl ?? null,
      visibility: data.visibility ?? "REVEALED",
    },
  });

  res.status(201).json(entity);
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

// POST execute — OWNER only.
entitiesRouter.post("/campaigns/:id/entities/merges/:mergeId/execute", async (req, res) => {
  await assertCampaignOwner(
    prisma,
    req.user!.id,
    req.params.id,
    "edit",
    "Only the campaign owner may execute a merge",
  );

  const result = await executeMerge(prisma, req.params.id, req.params.mergeId);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result.merge);
});

// DELETE unmerge — OWNER only.
entitiesRouter.delete("/campaigns/:id/entities/merges/:mergeId", async (req, res) => {
  await assertCampaignOwner(
    prisma,
    req.user!.id,
    req.params.id,
    "edit",
    "Only the campaign owner may unmerge entities",
  );

  const result = await deleteMerge(prisma, req.params.id, req.params.mergeId);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(204).end();
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

  res.json(entity);
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
    select: { id: true, campaignId: true },
  });
  if (!existing || existing.campaignId !== req.params.id) {
    res.status(404).json({ error: "Entity not found" });
    return;
  }

  await prisma.campaignEntity.delete({ where: { id: req.params.entityId } });
  res.status(204).end();
});

/**
 * GET /api/campaigns/:id/entities/:entityId/backlinks
 * Notes that @-tag this entity, newest-first. This is THE sharing surface
 * (#838): the caller's own entries plus other members' CAMPAIGN-visible ones.
 * A PRIVATE note is visible only to its author — no owner/DM bypass.
 */
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
