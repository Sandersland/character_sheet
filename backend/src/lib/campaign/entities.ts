import { Prisma, type PrismaClient } from "@/generated/prisma/client.js";
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
import { mentionToken, mentionTokenPattern } from "@/lib/activity/journal-refs.js";
import { logger } from "@/lib/core/logger.js";
import { deletePortraitBlobBestEffort } from "@/lib/storage/portrait-blob.js";

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
    // portraitKey rides along so the entity portrait GET is one round-trip; other callers ignore it.
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

// Owner sees all; a non-owner sees only EXECUTED merges whose both identities are REVEALED (a PREPARED merge or a hidden identity never leaks).
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

// Idempotent on re-execute: keeps the first executedAt.
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

// Refs stay pointing at whichever id was actually tagged — this doesn't touch them.
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
  include: {
    characterLink: { select: { characterId: true } };
    itemLink: { select: { itemId: true } };
  };
}>;

export type CombineResult =
  | { ok: true; entity: CombinedEntity }
  | { ok: false; status: 400 | 404 | 409; error: string };

const duplicateSurvivorSelect = {
  id: true,
  campaignId: true,
  type: true,
  portraitKey: true,
  characterLink: true,
  itemLink: true,
} satisfies Prisma.CampaignEntitySelect;

type LinkedEntity = Prisma.CampaignEntityGetPayload<{ select: typeof duplicateSurvivorSelect }>;

type Tx = Prisma.TransactionClient;

// Thrown from inside the tx and mapped back to ok:false after it unwinds; Prisma rolls back automatically on the throw.
class CombineGuardError extends Error {
  constructor(
    public status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

// Shared by assertNotPubliclyRevealed and repointMergeChains: an EXECUTED merge is a public reveal, so it can never silently vanish in a combine.
function publiclyRevealedMergeError(): CombineGuardError {
  return new CombineGuardError(
    409,
    "This entity is a publicly revealed identity merge — unmerge it before combining",
  );
}

// Rewrites every @[<dupId>] token across the WHOLE JournalEntry table (not scoped to campaign membership): duplicateId is a globally-unique id, so matching on the token alone can't cross into another campaign's data. The ILIKE prefilter keeps untouched rows out of the write; regexp_replace's 'gi' flag catches a hand-typed uppercase token.
async function rewriteMentionTokens(
  tx: Tx,
  duplicateId: string,
  survivorEntityId: string,
): Promise<void> {
  const literalToken = mentionToken(duplicateId);
  const regexToken = mentionTokenPattern(duplicateId);
  const replacement = mentionToken(survivorEntityId);

  await tx.$executeRaw`
    UPDATE "JournalEntry"
    SET body = regexp_replace(body, ${regexToken}, ${replacement}, 'gi')
    WHERE body ILIKE ${`%${literalToken}%`}
  `;

  // Delete-then-recreate, not delete-if-conflicting-then-update: skipDuplicates absorbs any (entryId, survivorEntityId) row a concurrent syncEntryRefs insert already created, so no unique-constraint race.
  const loserRefs = await tx.journalEntryRef.findMany({
    where: { entityId: duplicateId },
    select: { entryId: true },
  });
  await tx.journalEntryRef.deleteMany({ where: { entityId: duplicateId } });
  if (loserRefs.length > 0) {
    await tx.journalEntryRef.createMany({
      data: loserRefs.map((ref) => ({ entryId: ref.entryId, entityId: survivorEntityId })),
      skipDuplicates: true,
    });
  }
}

type MergeEdgeRow = Prisma.CampaignEntityMergeGetPayload<{
  select: { id: true; mergedEntityId: true; survivorEntityId: true; status: true };
}>;

// wouldCreateCycle must see every write an EARLIER loser in this same transaction already made, or its cycle detection reads stale data — so this snapshot is re-fetched only after an actual write, not once per loser.
async function fetchMergeEdges(tx: Tx, campaignId: string): Promise<MergeEdgeRow[]> {
  return tx.campaignEntityMerge.findMany({
    where: { campaignId },
    select: { id: true, mergedEntityId: true, survivorEntityId: true, status: true },
  });
}

// Re-points merge rows where a loser stood in as the survivor (A → loser) to the real survivor (A → S). A PREPARED row that would create a cycle is dropped silently; an EXECUTED row throws the same guard error as assertNotPubliclyRevealed rather than vanishing underneath a 200. Re-pointing an EXECUTED row keeps the survivor REVEALED, matching executeMerge's own invariant. Returns `allEdges` unchanged when this loser wrote nothing.
async function repointMergeChains(
  tx: Tx,
  campaignId: string,
  loserId: string,
  survivorEntityId: string,
  allEdges: MergeEdgeRow[],
): Promise<MergeEdgeRow[]> {
  const asSurvivor = allEdges.filter((e) => e.survivorEntityId === loserId);
  if (asSurvivor.length === 0) return allEdges;

  const toDrop: string[] = [];
  const toRepoint: string[] = [];
  let revealSurvivor = false;
  for (const row of asSurvivor) {
    const otherEdges = allEdges.filter((e) => e.id !== row.id);
    if (wouldCreateCycle(otherEdges, row.mergedEntityId, survivorEntityId)) {
      if (row.status === "EXECUTED") throw publiclyRevealedMergeError();
      toDrop.push(row.id);
      continue;
    }
    toRepoint.push(row.id);
    if (row.status === "EXECUTED") revealSurvivor = true;
  }

  if (toDrop.length > 0) {
    await tx.campaignEntityMerge.deleteMany({ where: { id: { in: toDrop } } });
  }
  if (toRepoint.length > 0) {
    await tx.campaignEntityMerge.updateMany({
      where: { id: { in: toRepoint } },
      data: { survivorEntityId },
    });
  }
  if (revealSurvivor) {
    await tx.campaignEntity.update({
      where: { id: survivorEntityId },
      data: { visibility: "REVEALED" },
    });
  }

  return fetchMergeEdges(tx, campaignId);
}

// The caller has already validated the WHOLE batch's link safety (assertBatchLinkConflicts) before any loser is applied, so `survivorState` here only needs to reflect what earlier losers in this same batch already moved.
async function moveSoleLinks(
  tx: Tx,
  loser: LinkedEntity,
  survivorState: LinkedEntity,
  loserId: string,
  survivorEntityId: string,
): Promise<void> {
  if (loser.characterLink && !survivorState.characterLink) {
    await tx.campaignCharacterLink.update({
      where: { campaignEntityId: loserId },
      data: { campaignEntityId: survivorEntityId },
    });
  }
  if (loser.itemLink && !survivorState.itemLink) {
    await tx.campaignItemLink.update({
      where: { campaignEntityId: loserId },
      data: { campaignEntityId: survivorEntityId },
    });
  }
}

// Locks survivor + every loser (in SORTED id order, not caller order) before any read, closing the inverse-combine race under READ COMMITTED and avoiding a two-way deadlock between two transactions locking the same ids in opposite roles. A missing id simply isn't locked; fetchCombineTargets's existence guard still 404s it.
async function lockCombineTargets(tx: Tx, ids: string[]): Promise<void> {
  const sortedIds = [...ids].sort();
  await tx.$queryRaw`
    SELECT id FROM "CampaignEntity" WHERE id IN (${Prisma.join(sortedIds)}) FOR UPDATE
  `;
}

// Safe from a concurrent-insert race: CampaignCharacterLink/CampaignItemLink are only ever created together with a brand-new CampaignEntity in the same transaction (join-campaign and create-item handlers), never attached to an existing one — so a concurrent insert can't target one of this combine's already-existing losers (contrast lockCombineTargets above, which guards a real race).
async function fetchCombineTargets(
  tx: Tx,
  campaignId: string,
  loserEntityIds: string[],
  survivorEntityId: string,
): Promise<{ survivor: LinkedEntity; losers: LinkedEntity[] }> {
  const rows = await tx.campaignEntity.findMany({
    where: { id: { in: [survivorEntityId, ...loserEntityIds] }, campaignId },
    select: duplicateSurvivorSelect,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const survivor = byId.get(survivorEntityId);
  const losers = loserEntityIds.map((id) => byId.get(id));
  if (!survivor || losers.some((loser) => !loser)) {
    throw new CombineGuardError(404, "Entity not found");
  }
  return { survivor, losers: losers as LinkedEntity[] };
}

// Two backed entities of the SAME kind are two real things, not a typo: reject before any write.
function assertNoBothLinkedConflicts(loser: LinkedEntity, survivor: LinkedEntity): void {
  if (loser.characterLink && survivor.characterLink) {
    throw new CombineGuardError(409, "Both entities are linked to a character");
  }
  if (loser.itemLink && survivor.itemLink) {
    throw new CombineGuardError(409, "Both entities are linked to an item");
  }
}

// The item lifecycle owns its fronting entity (deleting a campaign item cascades its linked CampaignEntity) and the codex only renders item data for ITEM-typed entities, so an item link only moves onto an ITEM-typed survivor.
function assertItemLinkMovable(loser: LinkedEntity, survivor: LinkedEntity): void {
  if (loser.itemLink && !survivor.itemLink && survivor.type !== "ITEM") {
    throw new CombineGuardError(
      409,
      "The survivor must be an ITEM entity to inherit the duplicate's item link",
    );
  }
}

// Mirrors assertItemLinkMovable: a character link only moves onto a PC-typed survivor with no item link — otherwise a later item delete would cascade away the player's own codex entity.
function assertCharacterLinkMovable(loser: LinkedEntity, survivor: LinkedEntity): void {
  if (!loser.characterLink || survivor.characterLink) return;
  if (survivor.type !== "PC") {
    throw new CombineGuardError(
      409,
      "The survivor must be a PC entity to inherit the duplicate's character link",
    );
  }
  if (survivor.itemLink) {
    throw new CombineGuardError(
      409,
      "The survivor already fronts a campaign item — combining would risk the character link being deleted along with it",
    );
  }
}

// Threads an evolving "virtual survivor" across the whole loser list so a SECOND loser conflicting with a link the FIRST loser would move is also caught up front. Order only changes which loser is blamed, never whether a conflict is reported.
function assertBatchLinkConflicts(survivor: LinkedEntity, losers: LinkedEntity[]): void {
  let virtualSurvivor = survivor;
  for (const loser of losers) {
    assertNoBothLinkedConflicts(loser, virtualSurvivor);
    assertItemLinkMovable(loser, virtualSurvivor);
    assertCharacterLinkMovable(loser, virtualSurvivor);
    virtualSurvivor = {
      ...virtualSurvivor,
      characterLink: virtualSurvivor.characterLink ?? loser.characterLink,
      itemLink: virtualSurvivor.itemLink ?? loser.itemLink,
    };
  }
}

// An EXECUTED merge where the loser is the merged side is a public fact — cascade-deleting it while moving its mentions would be a silent lie. A PREPARED row is still secret DM prep and keeps dying with the cascade.
async function assertNotPubliclyRevealed(tx: Tx, campaignId: string, loserId: string): Promise<void> {
  const revealedAsMerged = await tx.campaignEntityMerge.findFirst({
    where: { campaignId, mergedEntityId: loserId, status: "EXECUTED" },
    select: { id: true },
  });
  if (revealedAsMerged) throw publiclyRevealedMergeError();
}

// Runs inside the transaction (not before it opens) so a concurrent combine can't race past these guards. Throws CombineGuardError rather than returning a result the caller could mistake for success.
async function loadAndGuardCombineTargets(
  tx: Tx,
  campaignId: string,
  loserEntityIds: string[],
  survivorEntityId: string,
): Promise<{ survivor: LinkedEntity; losers: LinkedEntity[] }> {
  await lockCombineTargets(tx, [survivorEntityId, ...loserEntityIds]);
  const targets = await fetchCombineTargets(tx, campaignId, loserEntityIds, survivorEntityId);
  assertBatchLinkConflicts(targets.survivor, targets.losers);
  for (const loser of targets.losers) {
    await assertNotPubliclyRevealed(tx, campaignId, loser.id);
  }
  return targets;
}

// Mirrors combineEntitiesSchema's own refinements — kept here too as defense in depth for any non-HTTP caller.
function validateBatchShape(
  loserEntityIds: string[],
  survivorEntityId: string,
): CombineGuardError | null {
  if (loserEntityIds.length === 0) {
    return new CombineGuardError(400, "At least one duplicate must be provided");
  }
  if (new Set(loserEntityIds).size !== loserEntityIds.length) {
    return new CombineGuardError(400, "Duplicate ids must not repeat");
  }
  if (loserEntityIds.includes(survivorEntityId)) {
    return new CombineGuardError(400, "The survivor cannot also be a duplicate");
  }
  return null;
}

// survivorState threads through the loop so a later loser's link move sees what an earlier loser already moved onto the survivor in this same transaction.
async function applyBatchCombine(
  tx: Tx,
  campaignId: string,
  loserEntityIds: string[],
  survivorEntityId: string,
): Promise<{ entity: CombinedEntity; loserPortraitKeys: (string | null)[] }> {
  const { survivor, losers } = await loadAndGuardCombineTargets(
    tx,
    campaignId,
    loserEntityIds,
    survivorEntityId,
  );
  const loserPortraitKeys = losers.map((loser) => loser.portraitKey);

  let survivorState = survivor;
  let mergeEdges = await fetchMergeEdges(tx, campaignId);
  for (const loser of losers) {
    await rewriteMentionTokens(tx, loser.id, survivorEntityId);
    mergeEdges = await repointMergeChains(tx, campaignId, loser.id, survivorEntityId, mergeEdges);
    await moveSoleLinks(tx, loser, survivorState, loser.id, survivorEntityId);
    await tx.campaignEntity.delete({ where: { id: loser.id } });
    survivorState = {
      ...survivorState,
      characterLink: survivorState.characterLink ?? loser.characterLink,
      itemLink: survivorState.itemLink ?? loser.itemLink,
    };
  }

  const entity = await tx.campaignEntity.findUniqueOrThrow({
    where: { id: survivorEntityId },
    include: {
      characterLink: { select: { characterId: true } },
      itemLink: { select: { itemId: true } },
    },
  });
  return { entity, loserPortraitKeys };
}

// null return signals "not ours, rethrow" (an unexpected error stays a real 500). P2025 = an expected row vanished; P2002/P2003 = a concurrent write collided — all three are the caller's problem, not a 500. Logged at warn level BEFORE mapping so a genuine coding bug isn't silently hidden behind the same "conflict" response.
function mapCombineError(
  err: unknown,
  ctx: { campaignId: string; survivorEntityId: string; loserEntityIds: string[] },
): CombineResult | null {
  if (err instanceof CombineGuardError) {
    return { ok: false, status: err.status, error: err.message };
  }
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;

  const mappedStatus =
    err.code === "P2025" ? 404 : err.code === "P2002" || err.code === "P2003" ? 409 : null;
  if (mappedStatus === null) return null;

  logger.warn(
    { code: err.code, meta: err.meta, ...ctx },
    "combineEntities: mapped a Prisma error to a client-facing response — check meta here before assuming a real race rather than a coding bug (#1942)",
  );
  return {
    ok: false,
    status: mappedStatus,
    error: mappedStatus === 404 ? "Entity not found" : "Combine conflicts with a concurrent change",
  };
}

// Absorbs every loserEntityIds duplicate into survivorEntityId atomically: guards run up front against the WHOLE batch before any loser is combined, then all losers apply in one all-or-nothing transaction. Survivor's fields always win; nothing folds from a loser. No audit row and no undo — the client-side confirm dialog is the only gate.
export async function combineEntities(
  db: PrismaClient,
  campaignId: string,
  loserEntityIds: string[],
  survivorEntityId: string,
): Promise<CombineResult> {
  const shapeError = validateBatchShape(loserEntityIds, survivorEntityId);
  if (shapeError) return { ok: false, status: shapeError.status, error: shapeError.message };

  try {
    const { entity, loserPortraitKeys } = await db.$transaction(
      (tx) => applyBatchCombine(tx, campaignId, loserEntityIds, survivorEntityId),
      // Generous timeout: a large batch/journal table means real row-lock contention, and this destructive op must not time out partway through.
      { timeout: 30_000 },
    );
    await Promise.all(loserPortraitKeys.map((key) => deletePortraitBlobBestEffort(key)));
    return { ok: true, entity };
  } catch (err) {
    const mapped = mapCombineError(err, { campaignId, survivorEntityId, loserEntityIds });
    if (mapped) return mapped;
    throw err;
  }
}

type ListedEntity = { id: string; notes: string | null };

const EMPTY_AGGREGATE: EntityStatsAggregate = {
  mentionCount: 0,
  firstMentioned: null,
  lastMentioned: null,
  chroniclers: [],
};

// #1945: shared with buildNeedsChroniclingRow's flag — one definition of "described" for both the Codex card and the inbox.
export function hasDescription(notes: string | null): boolean {
  return (notes ?? "").trim().length > 0;
}

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
    hasDescription: hasDescription(notes),
  };
}

// Maps each identity (listed or merged-in) to the listed survivor(s) its refs should attribute to.
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

// Fixed query count regardless of N.
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
    // A type-filtered list may miss merged identities of other types; the scrub needs every entity's visibility.
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

// A PRIVATE note is author-only — no DM bypass, even for the owner.
export async function buildEntityBacklinks(
  db: PrismaClient,
  campaignId: string,
  userId: string,
  isOwner: boolean,
  entityId: string,
) {
  // A survivor's backlinks include refs of every identity EXECUTED-merged transitively into it, each labeled by which identity was tagged; a non-owner never sees a HIDDEN identity's refs/name.
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
        // Own entries, or CAMPAIGN-shared ones from characters still in this campaign (refs survive a character leaving; the share must not).
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

// Co-mention graph: entities sharing a visible entry with the target, merge-resolved to survivors, counted by distinct entries, sorted desc.
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
