import { Router } from "express";
import { z } from "zod";

import { assertCampaignMembership } from "../lib/auth/access.js";
import { normalizeForMatch } from "../lib/journal-refs.js";
import { prisma } from "../lib/prisma.js";

// Campaign entity registry (#248): the shared wiki of NPCs/locations/factions/
// items/PCs a table tags from journal notes. Plain-REST (like campaigns.ts):
// no audit log, no transaction-op pattern. Every route gates on
// assertCampaignMembership; DELETE additionally requires the OWNER role.

export const entitiesRouter = Router();

const ENTITY_TYPES = ["NPC", "LOCATION", "FACTION", "ITEM", "PC", "OTHER"] as const;

const createEntitySchema = z
  .object({
    type: z.enum(ENTITY_TYPES),
    name: z.string().min(1),
    aliases: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })
  .strict();

const updateEntitySchema = z
  .object({
    type: z.enum(ENTITY_TYPES),
    name: z.string().min(1),
    aliases: z.array(z.string()),
    notes: z.string().nullable(),
  })
  .partial()
  .strict();

// ── GET /api/campaigns/:id/entities?q=&type= ─────────────────────────────────
// List/search the campaign's entities. The campaign-scoped volume is small, so
// we fetch (optionally narrowed by a valid type) and match in memory via the
// same normalized key on both name and aliases. An invalid type is ignored.

entitiesRouter.get("/campaigns/:id/entities", async (req, res) => {
  await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");

  const typeParam = typeof req.query.type === "string" ? req.query.type : undefined;
  const type = (ENTITY_TYPES as readonly string[]).includes(typeParam ?? "")
    ? (typeParam as (typeof ENTITY_TYPES)[number])
    : undefined;

  const entities = await prisma.campaignEntity.findMany({
    where: { campaignId: req.params.id, ...(type ? { type } : {}) },
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
  await assertCampaignMembership(prisma, req.user!.id, req.params.id, "edit");

  const parseResult = createEntitySchema.safeParse(req.body);
  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  const data = parseResult.data;
  const entity = await prisma.campaignEntity.create({
    data: {
      campaignId: req.params.id,
      type: data.type,
      name: data.name,
      aliases: data.aliases ?? [],
      notes: data.notes ?? null,
    },
  });

  res.status(201).json(entity);
});

// ── PATCH /api/campaigns/:id/entities/:entityId ──────────────────────────────
// Edit an entity. Any member; 404 if the entity isn't in this campaign.

entitiesRouter.patch("/campaigns/:id/entities/:entityId", async (req, res) => {
  await assertCampaignMembership(prisma, req.user!.id, req.params.id, "edit");

  const parseResult = updateEntitySchema.safeParse(req.body);
  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
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
  await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");

  const entity = await prisma.campaignEntity.findUnique({
    where: { id: req.params.entityId },
    select: { id: true, campaignId: true },
  });
  if (!entity || entity.campaignId !== req.params.id) {
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
        title: ref.entry.title,
        date: ref.entry.date,
        loggedAt: ref.entry.loggedAt,
        body: ref.entry.body,
      },
      characterName: ref.entry.character.name,
    })),
  );
});
