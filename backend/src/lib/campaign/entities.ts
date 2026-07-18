// Campaign-entity domain logic (#1001): stats aggregation, merge lifecycle,
// and journal-ref attribution. HTTP-free; routes pass `db` and map results.

import type { PrismaClient } from "@/generated/prisma/client.js";
import { wouldCreateCycle } from "@/lib/activity/entity-merges.js";
import {
  aggregateEntityStats,
  resolveVisibleMergeUnion,
  visibleEntryWhere,
  buildSessionOrdinalMap,
  type EntityStatsAggregate,
  type StatRef,
} from "@/lib/activity/entity-stats.js";

// Session context resolver for mention refs: title + startedAt-ordinal (#839).
export async function loadSessionContext(db: PrismaClient, campaignId: string) {
  const sessions = await db.session.findMany({
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

// Hidden entities are invisible to non-owners: null → 404 rather than leak existence.
export async function findViewableEntity(
  db: PrismaClient,
  entityId: string,
  campaignId: string,
  isOwner: boolean,
) {
  const entity = await db.campaignEntity.findUnique({
    where: { id: entityId },
    select: { id: true, campaignId: true, visibility: true },
  });
  if (!entity || entity.campaignId !== campaignId) return null;
  return isOwner || entity.visibility !== "HIDDEN" ? entity : null;
}

// ── Entity identity merges (#387) ────────────────────────────────────────────

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

type SerializedMerge = ReturnType<typeof serializeMerge>;

export type MergeResult =
  | { ok: true; merge: SerializedMerge }
  | { ok: false; status: 400 | 404; error: string };

export type DeleteMergeResult = { ok: true } | { ok: false; status: 404; error: string };

// Owner sees all; a non-owner sees only EXECUTED merges whose both identities
// are REVEALED (a PREPARED merge or a hidden identity never leaks).
export async function listVisibleMerges(
  db: PrismaClient,
  campaignId: string,
  isOwner: boolean,
): Promise<SerializedMerge[]> {
  const merges = await db.campaignEntityMerge.findMany({
    where: { campaignId },
    include: {
      mergedEntity: { select: { visibility: true } },
      survivorEntity: { select: { visibility: true } },
    },
    orderBy: { preparedAt: "asc" },
  });

  const visible = isOwner
    ? merges
    : merges.filter(
        (m) =>
          m.status === "EXECUTED" &&
          m.mergedEntity.visibility === "REVEALED" &&
          m.survivorEntity.visibility === "REVEALED",
      );

  return visible.map(serializeMerge);
}

// Validates same-campaign, no self-merge, the merged entity isn't already
// merged, and no cycle. Creates a PREPARED record.
export async function prepareMerge(
  db: PrismaClient,
  campaignId: string,
  input: { mergedEntityId: string; survivorEntityId: string; note?: string },
): Promise<MergeResult> {
  const { mergedEntityId, survivorEntityId, note } = input;

  if (mergedEntityId === survivorEntityId) {
    return { ok: false, status: 400, error: "An entity cannot merge into itself" };
  }

  const both = await db.campaignEntity.findMany({
    where: { id: { in: [mergedEntityId, survivorEntityId] }, campaignId },
    select: { id: true },
  });
  if (both.length !== 2) {
    return { ok: false, status: 400, error: "Both entities must belong to this campaign" };
  }

  const already = await db.campaignEntityMerge.findUnique({ where: { mergedEntityId } });
  if (already) {
    return { ok: false, status: 400, error: "That entity is already merged into another identity" };
  }

  const edges = await db.campaignEntityMerge.findMany({
    where: { campaignId },
    select: { mergedEntityId: true, survivorEntityId: true, status: true },
  });
  if (wouldCreateCycle(edges, mergedEntityId, survivorEntityId)) {
    return { ok: false, status: 400, error: "That merge would create an identity cycle" };
  }

  const merge = await db.campaignEntityMerge.create({
    data: { campaignId, mergedEntityId, survivorEntityId, note: note ?? null },
  });
  return { ok: true, merge: serializeMerge(merge) };
}

// Flips PREPARED→EXECUTED and auto-reveals a HIDDEN survivor in the same txn
// (#379). Idempotent: keeps the first executedAt.
export async function executeMerge(
  db: PrismaClient,
  campaignId: string,
  mergeId: string,
): Promise<MergeResult> {
  const merge = await db.campaignEntityMerge.findUnique({ where: { id: mergeId } });
  if (!merge || merge.campaignId !== campaignId) {
    return { ok: false, status: 404, error: "Merge not found" };
  }

  const updated = await db.$transaction(async (tx) => {
    await tx.campaignEntity.update({
      where: { id: merge.survivorEntityId },
      data: { visibility: "REVEALED" },
    });
    return tx.campaignEntityMerge.update({
      where: { id: merge.id },
      data: { status: "EXECUTED", executedAt: merge.executedAt ?? new Date() },
    });
  });
  return { ok: true, merge: serializeMerge(updated) };
}

// Removes the record; the entities regain full independence and refs stay
// pointing at whichever id was actually tagged.
export async function deleteMerge(
  db: PrismaClient,
  campaignId: string,
  mergeId: string,
): Promise<DeleteMergeResult> {
  const merge = await db.campaignEntityMerge.findUnique({
    where: { id: mergeId },
    select: { id: true, campaignId: true },
  });
  if (!merge || merge.campaignId !== campaignId) {
    return { ok: false, status: 404, error: "Merge not found" };
  }

  await db.campaignEntityMerge.delete({ where: { id: merge.id } });
  return { ok: true };
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
  db: PrismaClient,
  campaignId: string,
  userId: string,
  attributeTo: Map<string, string[]>,
): Promise<StatRef[]> {
  if (attributeTo.size === 0) return [];
  const refRows = await db.journalEntryRef.findMany({
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
export async function withEntityStats<E extends ListedEntity>(
  db: PrismaClient,
  campaignId: string,
  userId: string,
  isOwner: boolean,
  matched: E[],
) {
  const [edges, allEntities, ctx] = await Promise.all([
    db.campaignEntityMerge.findMany({
      where: { campaignId },
      select: { mergedEntityId: true, survivorEntityId: true, status: true },
    }),
    // A type-filtered list may miss merged identities of other types; the scrub
    // needs every entity's visibility.
    db.campaignEntity.findMany({
      where: { campaignId },
      select: { id: true, visibility: true },
    }),
    loadSessionContext(db, campaignId),
  ]);
  const revealedIds = new Set(
    allEntities.filter((e) => e.visibility === "REVEALED").map((e) => e.id),
  );
  const listedIds = matched.map((e) => e.id);
  const union = resolveVisibleMergeUnion(edges, listedIds, revealedIds, isOwner);
  const attributeTo = buildAttributionIndex(union);
  const statRefs = await fetchVisibleStatRefs(db, campaignId, userId, attributeTo);
  const stats = aggregateEntityStats(statRefs);
  return matched.map((e) => ({ ...e, stats: statsPayload(stats.get(e.id), e.notes, ctx) }));
}
