// GET /api/inbox derived rows (#1945): duplicate-name entity clusters and
// needs-chronicling counts, recomputed at read time for every campaign the
// caller OWNS. Nothing about a flag is persisted — only that a user
// dismissed one (InboxDismissal), filtered in by the route.

import type { PrismaClient } from "@/generated/prisma/client.js";
import { aggregateEntityStats, visibleEntryWhere, type EntityStatsAggregate } from "@/lib/activity/entity-stats.js";
import { hasDescription } from "@/lib/campaign/entities.js";
import {
  buildDuplicateClusters,
  buildMergeExclusionSet,
  clusterSignature,
  pairKey,
  pickDefaultSurvivor,
} from "@/lib/campaign/inbox-clustering.js";

export interface InboxDuplicateEntity {
  id: string;
  name: string;
  type: string;
  visibility: string;
  mentionCount: number;
}

export interface InboxDuplicateClusterRow {
  kind: "DUPLICATE_CLUSTER";
  campaignId: string;
  campaignName: string;
  signature: string;
  entities: InboxDuplicateEntity[];
  defaultSurvivorId: string;
  /** ISO timestamp this row was sorted by (#1946: relative-time meta for the UI). */
  signalAt: string;
}

export interface InboxNeedsChroniclingRow {
  kind: "NEEDS_CHRONICLING";
  campaignId: string;
  campaignName: string;
  signature: string;
  count: number;
  /** ISO timestamp this row was sorted by (#1946: relative-time meta for the UI). */
  signalAt: string;
}

export type InboxRow = InboxDuplicateClusterRow | InboxNeedsChroniclingRow;

type EntityRow = {
  id: string;
  name: string;
  type: string;
  visibility: string;
  notes: string | null;
  createdAt: Date;
};

interface EnrichedEntity extends EntityRow {
  mentionCount: number;
  lastMentionedAt: Date | null;
}

function enrichEntities(entities: EntityRow[], stats: Map<string, EntityStatsAggregate>): EnrichedEntity[] {
  return entities.map((e) => {
    const agg = stats.get(e.id);
    return { ...e, mentionCount: agg?.mentionCount ?? 0, lastMentionedAt: agg?.lastMentioned?.date ?? null };
  });
}

function entitySignalDate(e: EnrichedEntity): Date {
  return e.lastMentionedAt ?? e.createdAt;
}

function latestOf(dates: Date[]): Date {
  return dates.reduce((latest, d) => (d > latest ? d : latest));
}

function toWireDuplicateEntity(e: EnrichedEntity): InboxDuplicateEntity {
  return { id: e.id, name: e.name, type: e.type, visibility: e.visibility, mentionCount: e.mentionCount };
}

interface SignaledRow {
  row: InboxRow;
  // Sort key ONLY — the wire-facing timestamp lives on row.signalAt (string);
  // this stays a Date so the final cross-campaign sort needs no re-parsing.
  sortAt: Date;
}

function toDuplicateRow(
  campaign: { id: string; name: string },
  ids: string[],
  byId: Map<string, EnrichedEntity>,
): SignaledRow {
  const clusterEntities = ids.map((id) => byId.get(id)!);
  const sortAt = latestOf(clusterEntities.map(entitySignalDate));
  const row: InboxDuplicateClusterRow = {
    kind: "DUPLICATE_CLUSTER",
    campaignId: campaign.id,
    campaignName: campaign.name,
    signature: clusterSignature(ids),
    entities: clusterEntities.map(toWireDuplicateEntity),
    defaultSurvivorId: pickDefaultSurvivor(clusterEntities),
    signalAt: sortAt.toISOString(),
  };
  return { row, sortAt };
}

function buildDuplicateRows(
  campaign: { id: string; name: string },
  entities: EnrichedEntity[],
  merges: { mergedEntityId: string; survivorEntityId: string }[],
): SignaledRow[] {
  const exclusionSet = buildMergeExclusionSet(merges);
  const isExcludedPair = (a: string, b: string) => exclusionSet.has(pairKey(a, b));
  const clusters = buildDuplicateClusters(entities, isExcludedPair);
  const byId = new Map(entities.map((e) => [e.id, e]));
  return clusters.map((ids) => toDuplicateRow(campaign, ids, byId));
}

function buildNeedsChroniclingRow(
  campaign: { id: string; name: string },
  entities: EnrichedEntity[],
): SignaledRow | null {
  const flagged = entities.filter((e) => e.mentionCount > 0 && !hasDescription(e.notes));
  if (flagged.length === 0) return null;
  const sortAt = latestOf(flagged.map(entitySignalDate));
  const row: InboxNeedsChroniclingRow = {
    kind: "NEEDS_CHRONICLING",
    campaignId: campaign.id,
    campaignName: campaign.name,
    signature: campaign.id,
    count: flagged.length,
    signalAt: sortAt.toISOString(),
  };
  return { row, sortAt };
}

async function loadCampaignStats(
  db: PrismaClient,
  campaignId: string,
  userId: string,
  entityIds: string[],
): Promise<Map<string, EntityStatsAggregate>> {
  if (entityIds.length === 0) return new Map();
  const refRows = await db.journalEntryRef.findMany({
    where: { entityId: { in: entityIds }, entry: visibleEntryWhere(userId, campaignId) },
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
  return aggregateEntityStats(
    refRows.map((r) => ({
      entityId: r.entityId,
      entryId: r.entryId,
      characterName: r.entry.character.name,
      sessionId: r.entry.sessionId,
      date: r.entry.date,
      loggedAt: r.entry.loggedAt,
      createdAt: r.entry.createdAt,
    })),
  );
}

async function buildCampaignInboxRows(
  db: PrismaClient,
  campaign: { id: string; name: string },
  userId: string,
): Promise<SignaledRow[]> {
  const entities = await db.campaignEntity.findMany({
    where: { campaignId: campaign.id },
    select: { id: true, name: true, type: true, visibility: true, notes: true, createdAt: true },
  });
  if (entities.length === 0) return [];

  const [merges, stats] = await Promise.all([
    db.campaignEntityMerge.findMany({
      where: { campaignId: campaign.id },
      select: { mergedEntityId: true, survivorEntityId: true },
    }),
    loadCampaignStats(db, campaign.id, userId, entities.map((e) => e.id)),
  ]);

  const enriched = enrichEntities(entities, stats);
  const rows = buildDuplicateRows(campaign, enriched, merges);
  const chronicling = buildNeedsChroniclingRow(campaign, enriched);
  return chronicling ? [...rows, chronicling] : rows;
}

// Every derived row across every campaign `userId` OWNS, newest-signal first.
export async function buildInboxRows(db: PrismaClient, userId: string): Promise<InboxRow[]> {
  const campaigns = await db.campaign.findMany({ where: { ownerId: userId }, select: { id: true, name: true } });
  const perCampaign = await Promise.all(campaigns.map((c) => buildCampaignInboxRows(db, c, userId)));
  return perCampaign
    .flat()
    .sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime())
    .map((x) => x.row);
}

// Drops rows this user already dismissed under this exact (kind, signature).
export function filterDismissed<T extends { kind: string; signature: string }>(
  rows: T[],
  dismissed: { kind: string; signature: string }[],
): T[] {
  const dismissedKeys = new Set(dismissed.map((d) => `${d.kind} ${d.signature}`));
  return rows.filter((r) => !dismissedKeys.has(`${r.kind} ${r.signature}`));
}
