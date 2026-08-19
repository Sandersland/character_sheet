// Campaign-entity domain logic: stats, merge lifecycle, backlinks,
// connections, activity feed, and attribution. HTTP-free; routes pass `db`.

import type { Prisma, PrismaClient } from "@/generated/prisma/client.js";
import { collectMergedInIdentities, wouldCreateCycle } from "@/lib/activity/entity-merges.js";
import {
  aggregateEntityStats,
  resolveVisibleMergeUnion,
  tallyCoMentions,
  visibleEntryWhere,
  buildSessionOrdinalMap,
  type EntityStatsAggregate,
  type StatRef,
} from "@/lib/activity/entity-stats.js";
import { extractEntityIds, reconcileEntryRefs } from "@/lib/activity/journal-refs.js";

// Session context resolver for mention refs: title + startedAt-ordinal (#839).
async function loadSessionContext(db: PrismaClient, campaignId: string) {
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
    // portraitKey rides along so the entity portrait GET is one round-trip
    // (#1657); other callers ignore the extra scalar.
    select: { id: true, campaignId: true, visibility: true, portraitKey: true },
  });
  if (!entity || entity.campaignId !== campaignId) return null;
  return isOwner || entity.visibility !== "HIDDEN" ? entity : null;
}

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

// Flips PREPARED→EXECUTED and auto-reveals the survivor in the same txn
// (#379). Idempotent on re-execute: keeps the first executedAt.
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

type CombinedEntity = Prisma.CampaignEntityGetPayload<{
  include: { characterLink: { select: { characterId: true } } };
}>;

export type CombineResult =
  | { ok: true; entity: CombinedEntity }
  | { ok: false; status: 400 | 404 | 409; error: string };

type LinkedEntity = {
  id: string;
  campaignId: string;
  characterLink: { campaignEntityId: string } | null;
  itemLink: { campaignEntityId: string } | null;
};

type Tx = Prisma.TransactionClient;

// Rewrites every @[<dupId>] mention token to @[<survivorId>] across ALL of the
// campaign's journal entries, regardless of author or visibility — unlike
// visibleEntryWhere (used everywhere else in this file), a combine must not
// leave a dangling token behind an author's own private note.
async function rewriteMentionTokens(
  tx: Tx,
  campaignId: string,
  duplicateId: string,
  survivorEntityId: string,
): Promise<void> {
  const taggedEntries = await tx.journalEntry.findMany({
    where: {
      character: { campaignId },
      body: { contains: `@[${duplicateId}]`, mode: "insensitive" },
    },
    select: { id: true, body: true },
  });
  const token = new RegExp(`@\\[${duplicateId}\\]`, "gi");
  for (const entry of taggedEntries) {
    const newBody = entry.body.replace(token, `@[${survivorEntityId}]`);
    if (newBody === entry.body) continue;
    await tx.journalEntry.update({ where: { id: entry.id }, data: { body: newBody } });
    await reconcileEntryRefs(tx, entry.id, extractEntityIds(newBody));
  }
}

// Re-points merge rows where the duplicate stood in as the survivor (A → dup)
// to the real survivor (A → S). A row that would become self-referential OR
// would close a cycle against the rest of the graph is dropped instead —
// wouldCreateCycle already covers the self-reference case (mergedId ===
// survivorId short-circuits true), so one check does both. Rows where the
// duplicate is mergedEntityId cascade-delete with the duplicate row the
// caller deletes after this returns — the typo's secret identity disappears
// with it.
async function repointMergeChains(
  tx: Tx,
  campaignId: string,
  duplicateId: string,
  survivorEntityId: string,
): Promise<void> {
  const asSurvivor = await tx.campaignEntityMerge.findMany({
    where: { campaignId, survivorEntityId: duplicateId },
    select: { id: true, mergedEntityId: true },
  });
  if (asSurvivor.length === 0) return;

  const allEdges = await tx.campaignEntityMerge.findMany({
    where: { campaignId },
    select: { id: true, mergedEntityId: true, survivorEntityId: true, status: true },
  });
  for (const row of asSurvivor) {
    const otherEdges = allEdges.filter((e) => e.id !== row.id);
    if (wouldCreateCycle(otherEdges, row.mergedEntityId, survivorEntityId)) {
      await tx.campaignEntityMerge.delete({ where: { id: row.id } });
      continue;
    }
    await tx.campaignEntityMerge.update({ where: { id: row.id }, data: { survivorEntityId } });
  }
}

// Moves a CampaignCharacterLink/CampaignItemLink from the duplicate to the
// survivor when only the duplicate carries it — the caller has already
// rejected the both-linked case as a 409 before the transaction opens.
async function moveSoleLinks(
  tx: Tx,
  duplicate: LinkedEntity,
  survivor: LinkedEntity,
  duplicateId: string,
  survivorEntityId: string,
): Promise<void> {
  if (duplicate.characterLink && !survivor.characterLink) {
    await tx.campaignCharacterLink.update({
      where: { campaignEntityId: duplicateId },
      data: { campaignEntityId: survivorEntityId },
    });
  }
  if (duplicate.itemLink && !survivor.itemLink) {
    await tx.campaignItemLink.update({
      where: { campaignEntityId: duplicateId },
      data: { campaignEntityId: survivorEntityId },
    });
  }
}

// Destructive typo-dedup (#1942), the counterpart to the non-destructive
// identity merge above: absorbs `duplicateId` into `survivorEntityId` and
// deletes the duplicate. Survivor's fields always win — nothing is folded
// from the duplicate (decided 2026-08-18). Cross-type combines are allowed.
// No audit row and no undo: there is no campaign-side event model and the
// existing merge ops persist nothing either; the client-side confirm dialog
// is the gate.
export async function combineEntities(
  db: PrismaClient,
  campaignId: string,
  duplicateId: string,
  survivorEntityId: string,
): Promise<CombineResult> {
  if (duplicateId === survivorEntityId) {
    return { ok: false, status: 400, error: "An entity cannot be combined with itself" };
  }

  const linkSelect = { characterLink: true, itemLink: true } as const;
  const [duplicate, survivor] = await Promise.all([
    db.campaignEntity.findUnique({
      where: { id: duplicateId },
      select: { id: true, campaignId: true, ...linkSelect },
    }),
    db.campaignEntity.findUnique({
      where: { id: survivorEntityId },
      select: { id: true, campaignId: true, ...linkSelect },
    }),
  ]);
  if (
    !duplicate ||
    duplicate.campaignId !== campaignId ||
    !survivor ||
    survivor.campaignId !== campaignId
  ) {
    return { ok: false, status: 404, error: "Entity not found" };
  }

  // Two backed entities are two real things, not a typo (#1942): reject before
  // any write when both sides carry a link of the same kind.
  if (duplicate.characterLink && survivor.characterLink) {
    return { ok: false, status: 409, error: "Both entities are linked to a character" };
  }
  if (duplicate.itemLink && survivor.itemLink) {
    return { ok: false, status: 409, error: "Both entities are linked to an item" };
  }

  const entity = await db.$transaction(async (tx) => {
    await rewriteMentionTokens(tx, campaignId, duplicateId, survivorEntityId);
    await repointMergeChains(tx, campaignId, duplicateId, survivorEntityId);
    await moveSoleLinks(tx, duplicate, survivor, duplicateId, survivorEntityId);
    await tx.campaignEntity.delete({ where: { id: duplicateId } });

    return tx.campaignEntity.findUniqueOrThrow({
      where: { id: survivorEntityId },
      include: { characterLink: { select: { characterId: true } } },
    });
  });

  return { ok: true, entity };
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

type ActivitySortable = { sortKey: [number, number, number] };

function activitySortKey(date: Date, loggedAt?: Date, createdAt?: Date): [number, number, number] {
  return [date.getTime(), (loggedAt ?? date).getTime(), (createdAt ?? date).getTime()];
}

function compareActivityDesc(a: ActivitySortable, b: ActivitySortable): number {
  return (
    b.sortKey[0] - a.sortKey[0] || b.sortKey[1] - a.sortKey[1] || b.sortKey[2] - a.sortKey[2]
  );
}

// Newest visible mention refs merged with entity-created events, newest-first.
export async function buildEntityActivityFeed(
  db: PrismaClient,
  campaignId: string,
  userId: string,
  isOwner: boolean,
  limit: number,
) {
  // Two bounded streams (each pre-sorted + capped at N) merged in memory.
  const [refs, createdEntities, ctx] = await Promise.all([
    db.journalEntryRef.findMany({
      where: {
        entity: {
          campaignId,
          ...(isOwner ? {} : { visibility: "REVEALED" }),
        },
        entry: visibleEntryWhere(userId, campaignId),
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
    db.campaignEntity.findMany({
      where: {
        campaignId,
        ...(isOwner ? {} : { visibility: "REVEALED" }),
      },
      select: { id: true, name: true, type: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    loadSessionContext(db, campaignId),
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

  return items
    .sort(compareActivityDesc)
    .slice(0, limit)
    .map(({ item }) => item);
}

// Notes @-tagging the entity, newest-first: the caller's own entries plus other
// members' CAMPAIGN-visible ones. A PRIVATE note is author-only — no DM bypass.
export async function buildEntityBacklinks(
  db: PrismaClient,
  campaignId: string,
  userId: string,
  isOwner: boolean,
  entityId: string,
) {
  // Identity-merge union (#387): a survivor's backlinks include the refs of every
  // identity that EXECUTED-merged transitively into it, each labeled by which
  // identity was tagged. A non-owner never sees a HIDDEN identity's refs/name.
  const edges = await db.campaignEntityMerge.findMany({
    where: { campaignId },
    select: { mergedEntityId: true, survivorEntityId: true, status: true },
  });
  let mergedIn = collectMergedInIdentities(edges, entityId, { executedOnly: true });
  if (!isOwner && mergedIn.length > 0) {
    const revealed = await db.campaignEntity.findMany({
      where: { id: { in: mergedIn }, visibility: "REVEALED" },
      select: { id: true },
    });
    const revealedSet = new Set(revealed.map((e) => e.id));
    mergedIn = mergedIn.filter((id) => revealedSet.has(id));
  }
  const entityIds = [entityId, ...mergedIn];

  const [refs, ctx] = await Promise.all([
    db.journalEntryRef.findMany({
      where: {
        entityId: { in: entityIds },
        // Own entries, or CAMPAIGN-shared ones from characters still in this
        // campaign (refs survive a character leaving; the share must not).
        entry: visibleEntryWhere(userId, campaignId),
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
    loadSessionContext(db, campaignId),
  ]);

  return refs.map((ref) => ({
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
  }));
}

// Co-mention graph: entities sharing a visible entry with the target,
// merge-resolved to survivors, counted by distinct entries, sorted desc.
export async function buildEntityConnections(
  db: PrismaClient,
  campaignId: string,
  userId: string,
  isOwner: boolean,
  targetId: string,
  limit: number,
) {
  const [edges, allEntities] = await Promise.all([
    db.campaignEntityMerge.findMany({
      where: { campaignId },
      select: { mergedEntityId: true, survivorEntityId: true, status: true },
    }),
    db.campaignEntity.findMany({
      where: { campaignId },
      select: { id: true, name: true, type: true, visibility: true },
    }),
  ]);
  const entityById = new Map(allEntities.map((e) => [e.id, e]));
  const revealedIds = new Set(
    allEntities.filter((e) => e.visibility === "REVEALED").map((e) => e.id),
  );
  const targetIds = new Set([
    targetId,
    ...(resolveVisibleMergeUnion(edges, [targetId], revealedIds, isOwner).get(targetId) ?? []),
  ]);

  const targetRefs = await db.journalEntryRef.findMany({
    where: {
      entityId: { in: [...targetIds] },
      entry: visibleEntryWhere(userId, campaignId),
    },
    select: { entryId: true },
  });
  const entryIds = [...new Set(targetRefs.map((r) => r.entryId))];

  const coRefs =
    entryIds.length === 0
      ? []
      : await db.journalEntryRef.findMany({
          where: { entryId: { in: entryIds } },
          select: { entryId: true, entityId: true },
        });

  return tallyCoMentions(coRefs, { edges, entityById, targetIds, isOwner })
    .slice(0, limit)
    .map(({ entity, count }) => ({
      entity: { id: entity.id, name: entity.name, type: entity.type },
      count,
    }));
}
