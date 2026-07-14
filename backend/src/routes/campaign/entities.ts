import { Router } from "express";
import { z } from "zod";

import { assertCampaignMembership, assertCampaignOwner } from "@/lib/auth/access.js";
import { collectMergedInIdentities, wouldCreateCycle } from "@/lib/activity/entity-merges.js";
import {
  aggregateEntityStats,
  buildSessionOrdinalMap,
  matchEntityQuery,
  resolveVisibleMergeUnion,
  tallyCoMentions,
  visibleEntryWhere,
  type EntityStatsAggregate,
  type StatRef,
} from "@/lib/activity/entity-stats.js";
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

// ── GET /api/campaigns/:id/entities?q=&type=&include=stats ───────────────────
// List/search the campaign's entities. The campaign-scoped volume is small, so
// we fetch (optionally narrowed by a valid type) and match in memory on name,
// aliases, and notes (#839), labeling each hit's field. An invalid type is
// ignored. ?include=stats attaches derived mention stats (computed at read; a
// fixed number of queries regardless of result size).

// Session context resolver for mention refs: title + startedAt-ordinal (#839).
async function loadSessionContext(campaignId: string) {
  const sessions = await prisma.session.findMany({
    where: { campaignId },
    orderBy: { startedAt: "asc" },
    select: { id: true, title: true },
  });
  return {
    ordinals: buildSessionOrdinalMap(sessions),
    titles: new Map(sessions.map((s) => [s.id, s.title])),
  };
}

type SessionContext = Awaited<ReturnType<typeof loadSessionContext>>;

function mentionRef(ref: StatRef | null, ctx: SessionContext) {
  if (!ref) return null;
  return {
    sessionId: ref.sessionId,
    sessionTitle: (ref.sessionId ? ctx.titles.get(ref.sessionId) : null) ?? null,
    sessionOrdinal: (ref.sessionId ? ctx.ordinals.get(ref.sessionId) : null) ?? null,
    date: ref.date,
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

// Hidden entities are invisible to non-owners: null → 404 rather than leak existence.
async function findViewableEntity(entityId: string, campaignId: string, isOwner: boolean) {
  const entity = await prisma.campaignEntity.findUnique({
    where: { id: entityId },
    select: { id: true, campaignId: true, visibility: true },
  });
  if (!entity || entity.campaignId !== campaignId) return null;
  return isOwner || entity.visibility !== "HIDDEN" ? entity : null;
}

type ListedEntity = { id: string; notes: string | null };

const EMPTY_AGGREGATE: EntityStatsAggregate = {
  mentionCount: 0,
  firstMentioned: null,
  lastMentioned: null,
  chroniclers: [],
};

function statsPayload(
  agg: EntityStatsAggregate | undefined,
  notes: string | null,
  ctx: SessionContext,
) {
  const a = agg ?? EMPTY_AGGREGATE;
  return {
    mentionCount: a.mentionCount,
    firstMentioned: mentionRef(a.firstMentioned, ctx),
    lastMentioned: mentionRef(a.lastMentioned, ctx),
    chroniclers: a.chroniclers,
    hasDescription: (notes ?? "").trim().length > 0,
  };
}

// Refs tagging a merged-in identity attribute to every listed survivor above it.
function buildAttributionIndex(union: Map<string, string[]>): Map<string, string[]> {
  const attributeTo = new Map<string, string[]>();
  for (const [listedId, mergedIn] of union) {
    for (const id of [listedId, ...mergedIn]) {
      getOrPush(attributeTo, id, listedId);
    }
  }
  return attributeTo;
}

function getOrPush(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
    return;
  }
  map.set(key, [value]);
}

async function fetchVisibleStatRefs(
  campaignId: string,
  userId: string,
  attributeTo: Map<string, string[]>,
): Promise<StatRef[]> {
  if (attributeTo.size === 0) return [];
  const refRows = await prisma.journalEntryRef.findMany({
    where: {
      entityId: { in: [...attributeTo.keys()] },
      entry: visibleEntryWhere(userId, campaignId),
    },
    select: {
      entityId: true,
      entryId: true,
      entry: {
        select: {
          sessionId: true,
          date: true,
          loggedAt: true,
          createdAt: true,
          character: { select: { name: true } },
        },
      },
    },
  });
  return refRows.flatMap((row) =>
    (attributeTo.get(row.entityId) ?? []).map((survivor) => ({
      entityId: survivor,
      entryId: row.entryId,
      characterName: row.entry.character.name,
      sessionId: row.entry.sessionId,
      date: row.entry.date,
      loggedAt: row.entry.loggedAt,
      createdAt: row.entry.createdAt,
    })),
  );
}

// Stats block for the list route (#839): fixed query count regardless of N.
async function withEntityStats<E extends ListedEntity>(
  campaignId: string,
  userId: string,
  isOwner: boolean,
  matched: E[],
) {
  const [edges, allEntities, ctx] = await Promise.all([
    prisma.campaignEntityMerge.findMany({
      where: { campaignId },
      select: { mergedEntityId: true, survivorEntityId: true, status: true },
    }),
    // A type-filtered list may miss merged identities of other types; the scrub
    // needs every entity's visibility.
    prisma.campaignEntity.findMany({
      where: { campaignId },
      select: { id: true, visibility: true },
    }),
    loadSessionContext(campaignId),
  ]);
  const revealedIds = new Set(
    allEntities.filter((e) => e.visibility === "REVEALED").map((e) => e.id),
  );
  const listedIds = matched.map((e) => e.id);
  const union = resolveVisibleMergeUnion(edges, listedIds, revealedIds, isOwner);
  const attributeTo = buildAttributionIndex(union);
  const statRefs = await fetchVisibleStatRefs(campaignId, userId, attributeTo);
  const stats = aggregateEntityStats(statRefs);
  return matched.map((e) => ({ ...e, stats: statsPayload(stats.get(e.id), e.notes, ctx) }));
}

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

  res.json(await withEntityStats(req.params.id, req.user!.id, isOwner, matched));
});

// ── GET /api/campaigns/:id/entities/activity ─────────────────────────────────
// Campaign-wide Codex activity (#839): the newest visible mention refs merged
// with entity-created events, newest-first. Registered before the generic
// :entityId routes so the /activity segment can't be shadowed.

type ActivitySortable = { sortKey: [number, number, number] };

function activitySortKey(date: Date, loggedAt?: Date, createdAt?: Date): [number, number, number] {
  return [date.getTime(), (loggedAt ?? date).getTime(), (createdAt ?? date).getTime()];
}

function compareActivityDesc(a: ActivitySortable, b: ActivitySortable): number {
  return (
    b.sortKey[0] - a.sortKey[0] || b.sortKey[1] - a.sortKey[1] || b.sortKey[2] - a.sortKey[2]
  );
}

entitiesRouter.get("/campaigns/:id/entities/activity", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");
  const isOwner = role === "OWNER";

  const limit = parseLimit(req.query.limit, 20);

  // Two bounded streams (each pre-sorted + capped at N) merged in memory.
  const [refs, createdEntities, ctx] = await Promise.all([
    prisma.journalEntryRef.findMany({
      where: {
        entity: {
          campaignId: req.params.id,
          ...(isOwner ? {} : { visibility: "REVEALED" }),
        },
        entry: visibleEntryWhere(req.user!.id, req.params.id),
      },
      select: {
        entity: { select: { id: true, name: true, type: true } },
        entry: {
          select: {
            sessionId: true,
            date: true,
            loggedAt: true,
            createdAt: true,
            character: { select: { name: true } },
          },
        },
      },
      orderBy: [
        { entry: { date: "desc" } },
        { entry: { loggedAt: "desc" } },
        { entry: { createdAt: "desc" } },
      ],
      take: limit,
    }),
    prisma.campaignEntity.findMany({
      where: {
        campaignId: req.params.id,
        ...(isOwner ? {} : { visibility: "REVEALED" }),
      },
      select: { id: true, name: true, type: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    loadSessionContext(req.params.id),
  ]);

  const items = [
    ...refs.map((ref) => ({
      sortKey: activitySortKey(ref.entry.date, ref.entry.loggedAt, ref.entry.createdAt),
      item: {
        kind: "mention" as const,
        characterName: ref.entry.character.name,
        entity: ref.entity,
        sessionOrdinal:
          (ref.entry.sessionId ? ctx.ordinals.get(ref.entry.sessionId) : null) ?? null,
        date: ref.entry.date,
      },
    })),
    ...createdEntities.map((e) => ({
      sortKey: activitySortKey(e.createdAt),
      item: {
        kind: "created" as const,
        entity: { id: e.id, name: e.name, type: e.type },
        date: e.createdAt,
      },
    })),
  ];

  res.json(
    items
      .sort(compareActivityDesc)
      .slice(0, limit)
      .map(({ item }) => item),
  );
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
      portraitUrl: data.portraitUrl ?? null,
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

  const entity = await findViewableEntity(req.params.entityId, req.params.id, role === "OWNER");
  if (!entity) {
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

  const [refs, ctx] = await Promise.all([
    prisma.journalEntryRef.findMany({
      where: {
        entityId: { in: entityIds },
        // Own entries, or CAMPAIGN-shared ones from characters still in this
        // campaign (refs survive a character leaving; the share must not).
        entry: visibleEntryWhere(req.user!.id, req.params.id),
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
    }),
    loadSessionContext(req.params.id),
  ]);

  res.json(
    refs.map((ref) => ({
      entry: {
        id: ref.entry.id,
        characterId: ref.entry.characterId,
        sessionId: ref.entry.sessionId,
        sessionTitle: (ref.entry.sessionId ? ctx.titles.get(ref.entry.sessionId) : null) ?? null,
        sessionOrdinal:
          (ref.entry.sessionId ? ctx.ordinals.get(ref.entry.sessionId) : null) ?? null,
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

// ── GET /api/campaigns/:id/entities/:entityId/connections ────────────────────
// Co-mention graph (#839): entities sharing a visible entry with this one,
// merge-resolved to survivors, counted by distinct entries, sorted desc.

entitiesRouter.get("/campaigns/:id/entities/:entityId/connections", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");
  const isOwner = role === "OWNER";

  const target = await findViewableEntity(req.params.entityId, req.params.id, isOwner);
  if (!target) {
    res.status(404).json({ error: "Entity not found" });
    return;
  }

  const limit = parseLimit(req.query.limit, 10);

  const [edges, allEntities] = await Promise.all([
    prisma.campaignEntityMerge.findMany({
      where: { campaignId: req.params.id },
      select: { mergedEntityId: true, survivorEntityId: true, status: true },
    }),
    prisma.campaignEntity.findMany({
      where: { campaignId: req.params.id },
      select: { id: true, name: true, type: true, visibility: true },
    }),
  ]);
  const entityById = new Map(allEntities.map((e) => [e.id, e]));
  const revealedIds = new Set(
    allEntities.filter((e) => e.visibility === "REVEALED").map((e) => e.id),
  );
  const targetIds = new Set([
    target.id,
    ...resolveVisibleMergeUnion(edges, [target.id], revealedIds, isOwner).get(target.id)!,
  ]);

  const targetRefs = await prisma.journalEntryRef.findMany({
    where: {
      entityId: { in: [...targetIds] },
      entry: visibleEntryWhere(req.user!.id, req.params.id),
    },
    select: { entryId: true },
  });
  const entryIds = [...new Set(targetRefs.map((r) => r.entryId))];

  const coRefs =
    entryIds.length === 0
      ? []
      : await prisma.journalEntryRef.findMany({
          where: { entryId: { in: entryIds } },
          select: { entryId: true, entityId: true },
        });

  res.json(
    tallyCoMentions(coRefs, { edges, entityById, targetIds, isOwner })
      .slice(0, limit)
      .map(({ entity, count }) => ({
        entity: { id: entity.id, name: entity.name, type: entity.type },
        count,
      })),
  );
});
