import { Router } from "express";
import { z } from "zod";

import { assertCampaignMembership, assertCampaignOwner } from "@/lib/auth/access.js";
import { collectMergedInIdentities, wouldCreateCycle } from "@/lib/activity/entity-merges.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import { normalizeForMatch } from "@/lib/activity/journal-refs.js";
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

  res.status(201).json(entity);
});

// ── Entity identity merges (#387) ────────────────────────────────────────────
// Owner-only "revealed to be" links. PREPARED is the DM's secret prep — scrubbed
// from every non-owner payload; EXECUTED is the public reveal (auto-reveals a
// HIDDEN survivor). Chains resolve transitively via lib/entity-merges. Registered
// before the generic :entityId routes so the /merges segment can't be shadowed.

const prepareMergeSchema = z
  .object({
    mergedEntityId: z.string().uuid(),
    survivorEntityId: z.string().uuid(),
    note: z.string().optional(),
  })
  .strict();

type MergeRow = {
  id: string;
  campaignId: string;
  mergedEntityId: string;
  survivorEntityId: string;
  status: "PREPARED" | "EXECUTED";
  note: string | null;
  preparedAt: Date;
  executedAt: Date | null;
};

function serializeMerge(m: MergeRow) {
  return {
    id: m.id,
    campaignId: m.campaignId,
    mergedEntityId: m.mergedEntityId,
    survivorEntityId: m.survivorEntityId,
    status: m.status,
    note: m.note,
    preparedAt: m.preparedAt,
    executedAt: m.executedAt,
  };
}

// GET list — owner sees all; a non-owner sees only EXECUTED merges whose both
// identities are REVEALED (a PREPARED merge or a hidden identity never leaks).
entitiesRouter.get("/campaigns/:id/entities/merges", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");

  const merges = await prisma.campaignEntityMerge.findMany({
    where: { campaignId: req.params.id },
    include: {
      mergedEntity: { select: { visibility: true } },
      survivorEntity: { select: { visibility: true } },
    },
    orderBy: { preparedAt: "asc" },
  });

  const visible =
    role === "OWNER"
      ? merges
      : merges.filter(
          (m) =>
            m.status === "EXECUTED" &&
            m.mergedEntity.visibility === "REVEALED" &&
            m.survivorEntity.visibility === "REVEALED",
        );

  res.json(visible.map(serializeMerge));
});

// POST prepare — OWNER only. Validates same-campaign, no self-merge, the merged
// entity isn't already merged, and no cycle. Creates a PREPARED record.
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
  const { mergedEntityId, survivorEntityId, note } = parsed;

  if (mergedEntityId === survivorEntityId) {
    res.status(400).json({ error: "An entity cannot merge into itself" });
    return;
  }

  const both = await prisma.campaignEntity.findMany({
    where: { id: { in: [mergedEntityId, survivorEntityId] }, campaignId: req.params.id },
    select: { id: true },
  });
  if (both.length !== 2) {
    res.status(400).json({ error: "Both entities must belong to this campaign" });
    return;
  }

  const already = await prisma.campaignEntityMerge.findUnique({ where: { mergedEntityId } });
  if (already) {
    res.status(400).json({ error: "That entity is already merged into another identity" });
    return;
  }

  const edges = await prisma.campaignEntityMerge.findMany({
    where: { campaignId: req.params.id },
    select: { mergedEntityId: true, survivorEntityId: true, status: true },
  });
  if (wouldCreateCycle(edges, mergedEntityId, survivorEntityId)) {
    res.status(400).json({ error: "That merge would create an identity cycle" });
    return;
  }

  const merge = await prisma.campaignEntityMerge.create({
    data: { campaignId: req.params.id, mergedEntityId, survivorEntityId, note: note ?? null },
  });
  res.status(201).json(serializeMerge(merge));
});

// POST execute — OWNER only. Flips PREPARED→EXECUTED and auto-reveals a HIDDEN
// survivor in the same txn (#379). Idempotent: keeps the first executedAt.
entitiesRouter.post("/campaigns/:id/entities/merges/:mergeId/execute", async (req, res) => {
  await assertCampaignOwner(
    prisma,
    req.user!.id,
    req.params.id,
    "edit",
    "Only the campaign owner may execute a merge",
  );

  const merge = await prisma.campaignEntityMerge.findUnique({ where: { id: req.params.mergeId } });
  if (!merge || merge.campaignId !== req.params.id) {
    res.status(404).json({ error: "Merge not found" });
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.campaignEntity.update({
      where: { id: merge.survivorEntityId },
      data: { visibility: "REVEALED" },
    });
    return tx.campaignEntityMerge.update({
      where: { id: merge.id },
      data: { status: "EXECUTED", executedAt: merge.executedAt ?? new Date() },
    });
  });
  res.json(serializeMerge(updated));
});

// DELETE unmerge — OWNER only. Removes the record; the entities regain full
// independence and refs stay pointing at whichever id was actually tagged.
entitiesRouter.delete("/campaigns/:id/entities/merges/:mergeId", async (req, res) => {
  await assertCampaignOwner(
    prisma,
    req.user!.id,
    req.params.id,
    "edit",
    "Only the campaign owner may unmerge entities",
  );

  const merge = await prisma.campaignEntityMerge.findUnique({
    where: { id: req.params.mergeId },
    select: { id: true, campaignId: true },
  });
  if (!merge || merge.campaignId !== req.params.id) {
    res.status(404).json({ error: "Merge not found" });
    return;
  }

  await prisma.campaignEntityMerge.delete({ where: { id: merge.id } });
  res.status(204).end();
});

// ── PATCH /api/campaigns/:id/entities/:entityId ──────────────────────────────
// Edit an entity. Any member; 404 if the entity isn't in this campaign.

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

// ── DELETE /api/campaigns/:id/entities/:entityId ─────────────────────────────
// Delete an entity (cascades its refs). OWNER only.

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

// ── GET /api/campaigns/:id/entities/:entityId/backlinks ──────────────────────
// Notes that @-tag this entity, newest-first. This is THE sharing surface
// (#838): the caller's own entries plus other members' CAMPAIGN-visible ones.
// A PRIVATE note is visible only to its author — no owner/DM bypass.

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

  // Identity-merge union (#387): a survivor's backlinks include the refs of every
  // identity that EXECUTED-merged transitively into it, each labeled by which
  // identity was tagged. A non-owner never sees a HIDDEN identity's refs/name.
  const edges = await prisma.campaignEntityMerge.findMany({
    where: { campaignId: req.params.id },
    select: { mergedEntityId: true, survivorEntityId: true, status: true },
  });
  let mergedIn = collectMergedInIdentities(edges, req.params.entityId, { executedOnly: true });
  if (role !== "OWNER" && mergedIn.length > 0) {
    const revealed = await prisma.campaignEntity.findMany({
      where: { id: { in: mergedIn }, visibility: "REVEALED" },
      select: { id: true },
    });
    const revealedSet = new Set(revealed.map((e) => e.id));
    mergedIn = mergedIn.filter((id) => revealedSet.has(id));
  }
  const entityIds = [req.params.entityId, ...mergedIn];

  const refs = await prisma.journalEntryRef.findMany({
    where: {
      entityId: { in: entityIds },
      // Own entries, or CAMPAIGN-shared ones from characters still in this
      // campaign (refs survive a character leaving; the share must not).
      entry: {
        OR: [
          { authorUserId: req.user!.id },
          { visibility: "CAMPAIGN", character: { campaignId: req.params.id } },
        ],
      },
    },
    include: {
      entity: { select: { id: true, name: true } },
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
      identity: { id: ref.entity.id, name: ref.entity.name },
    })),
  );
});
