import { Router } from "express";
import { z } from "zod";

import { assertCampaignMembership } from "../lib/auth/access.js";
import { normalizeForMatch } from "../lib/journal-refs.js";
import { prisma } from "../lib/prisma.js";

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
    // Owner-only (#379); presence in a non-owner PATCH is rejected at the route.
    visibility: z.enum(VISIBILITIES),
  })
  .partial()
  .strict();

// ── GET /api/campaigns/:id/entities?q=&type= ─────────────────────────────────
// List/search the campaign's entities. The campaign-scoped volume is small, so
// we fetch (optionally narrowed by a valid type) and match in memory via the
// same normalized key on both name and aliases. An invalid type is ignored.

entitiesRouter.get("/campaigns/:id/entities", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");

  const typeParam = typeof req.query.type === "string" ? req.query.type : undefined;
  const type = (ENTITY_TYPES as readonly string[]).includes(typeParam ?? "")
    ? (typeParam as (typeof ENTITY_TYPES)[number])
    : undefined;

  const entities = await prisma.campaignEntity.findMany({
    where: {
      campaignId: req.params.id,
      ...(type ? { type } : {}),
      // Non-owners see only revealed entities (#379); the owner sees all.
      ...(role === "OWNER" ? {} : { visibility: "REVEALED" }),
    },
    orderBy: { name: "asc" },
  });

  const q = typeof req.query.q === "string" ? normalizeForMatch(req.query.q) : "";
  const matched = q
    ? entities.filter((e) =>
        [e.name, ...e.aliases].some((s) => normalizeForMatch(s).includes(q)),
      )
    : entities;

  res.json(matched);
});

// ── POST /api/campaigns/:id/entities ─────────────────────────────────────────
// Create an entity. Any member may create.

entitiesRouter.post("/campaigns/:id/entities", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "edit");

  const parseResult = createEntitySchema.safeParse(req.body);
  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  const data = parseResult.data;
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

  res.status(201).json(entity);
});

// ── PATCH /api/campaigns/:id/entities/:entityId ──────────────────────────────
// Edit an entity. Any member; 404 if the entity isn't in this campaign.

entitiesRouter.patch("/campaigns/:id/entities/:entityId", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "edit");

  const parseResult = updateEntitySchema.safeParse(req.body);
  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  // Changing visibility is owner-only (#379); basic-field edits stay member-level.
  if (parseResult.data.visibility !== undefined && role !== "OWNER") {
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
    data: parseResult.data,
  });

  res.json(entity);
});

// ── DELETE /api/campaigns/:id/entities/:entityId ─────────────────────────────
// Delete an entity (cascades its refs). OWNER only.

entitiesRouter.delete("/campaigns/:id/entities/:entityId", async (req, res) => {
  const { role } = await assertCampaignMembership(
    prisma,
    req.user!.id,
    req.params.id,
    "edit",
  );
  if (role !== "OWNER") {
    res.status(403).json({ error: "Only the campaign owner may delete entities" });
    return;
  }

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

// ── GET /api/campaigns/:id/entities/:entityId/backlinks ──────────────────────
// Notes that @-tag this entity, newest-first. CRITICAL: filtered through the
// SAME private-by-default rule as journal.visibleEntries — only the caller's
// own entries, so another member's PRIVATE notes never leak here.

entitiesRouter.get("/campaigns/:id/entities/:entityId/backlinks", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");

  const entity = await prisma.campaignEntity.findUnique({
    where: { id: req.params.entityId },
    select: { id: true, campaignId: true, visibility: true },
  });
  // Hidden entities are invisible to non-owners: 404 rather than leak existence.
  if (
    !entity ||
    entity.campaignId !== req.params.id ||
    (entity.visibility === "HIDDEN" && role !== "OWNER")
  ) {
    res.status(404).json({ error: "Entity not found" });
    return;
  }

  const refs = await prisma.journalEntryRef.findMany({
    where: {
      entityId: req.params.entityId,
      // Private-by-default: only the caller's own entries (mirrors visibleEntries).
      entry: { authorUserId: req.user!.id },
    },
    include: {
      entry: { include: { character: { select: { name: true } } } },
    },
    orderBy: [
      { entry: { date: "desc" } },
      { entry: { loggedAt: "desc" } },
      { entry: { createdAt: "desc" } },
    ],
  });

  res.json(
    refs.map((ref) => ({
      entry: {
        id: ref.entry.id,
        characterId: ref.entry.characterId,
        sessionId: ref.entry.sessionId,
        kind: ref.entry.kind,
        date: ref.entry.date,
        loggedAt: ref.entry.loggedAt,
        body: ref.entry.body,
      },
      characterName: ref.entry.character.name,
    })),
  );
});
