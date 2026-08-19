// GET /api/inbox derived rows (#1945): duplicate-name entity clusters and
// needs-chronicling counts, recomputed at read time for every campaign the
// caller OWNS. Nothing about a flag is persisted — only that a user
// dismissed one (InboxDismissal), filtered in by the route.

import type { PrismaClient } from "@/generated/prisma/client.js";
import { hasDescription } from "@/lib/campaign/entities.js";
import { buildSurvivorMap, foldMentionStats, type MentionStats } from "@/lib/campaign/inbox-stats.js";
import { visibleEntryWhere } from "@/lib/activity/entity-stats.js";
import {
  buildDuplicateClusters,
  buildMergeExclusionSet,
  clusterSignature,
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

function enrichEntities(entities: EntityRow[], stats: Map<string, MentionStats>): EnrichedEntity[] {
  return entities.map((e) => {
    const agg = stats.get(e.id);
    return { ...e, mentionCount: agg?.mentionCount ?? 0, lastMentionedAt: agg?.lastMentionedAt ?? null };
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

function toDuplicateRow(
  campaign: { id: string; name: string },
  ids: string[],
  byId: Map<string, EnrichedEntity>,
): InboxDuplicateClusterRow {
  const clusterEntities = ids.map((id) => byId.get(id)!);
  return {
    kind: "DUPLICATE_CLUSTER",
    campaignId: campaign.id,
    campaignName: campaign.name,
    signature: clusterSignature(ids),
    entities: clusterEntities.map(toWireDuplicateEntity),
    defaultSurvivorId: pickDefaultSurvivor(clusterEntities),
    signalAt: latestOf(clusterEntities.map(entitySignalDate)).toISOString(),
  };
}

function buildDuplicateRows(
  campaign: { id: string; name: string },
  entities: EnrichedEntity[],
  merges: { mergedEntityId: string; survivorEntityId: string }[],
): InboxDuplicateClusterRow[] {
  const exclusionSet = buildMergeExclusionSet(merges);
  const clusters = buildDuplicateClusters(entities, exclusionSet);
  const byId = new Map(entities.map((e) => [e.id, e]));
  return clusters.map((ids) => toDuplicateRow(campaign, ids, byId));
}

function buildNeedsChroniclingRow(
  campaign: { id: string; name: string },
  entities: EnrichedEntity[],
): InboxNeedsChroniclingRow | null {
  const flagged = entities.filter((e) => e.mentionCount > 0 && !hasDescription(e.notes));
  if (flagged.length === 0) return null;
  // Same resurface-on-membership-change contract as a duplicate cluster
  // (clusterSignature): a newly-mentioned undescribed entity — or one that
  // finally gets a description — changes the sorted id list, so a prior
  // Disregard on the OLD set doesn't permanently mute the flag.
  return {
    kind: "NEEDS_CHRONICLING",
    campaignId: campaign.id,
    campaignName: campaign.name,
    signature: clusterSignature(flagged.map((e) => e.id)),
    count: flagged.length,
    signalAt: latestOf(flagged.map(entitySignalDate)).toISOString(),
  };
}

// Lean projection: the inbox needs only a count + last-mention date per
// entity, never the character/session join the Codex activity feed needs —
// see inbox-stats.ts's own why-comment.
async function loadCampaignStats(
  db: PrismaClient,
  campaignId: string,
  userId: string,
  entityIds: string[],
  survivorOf: ReadonlyMap<string, string>,
): Promise<Map<string, MentionStats>> {
  if (entityIds.length === 0) return new Map();
  const refRows = await db.journalEntryRef.findMany({
    where: { entityId: { in: entityIds }, entry: visibleEntryWhere(userId, campaignId) },
    select: { entityId: true, entry: { select: { date: true } } },
  });
  return foldMentionStats(
    refRows.map((r) => ({ entityId: r.entityId, date: r.entry.date })),
    survivorOf,
  );
}

async function buildCampaignInboxRows(
  db: PrismaClient,
  campaign: { id: string; name: string },
  userId: string,
): Promise<InboxRow[]> {
  const entities = await db.campaignEntity.findMany({
    where: { campaignId: campaign.id },
    select: { id: true, name: true, type: true, visibility: true, notes: true, createdAt: true },
  });
  if (entities.length === 0) return [];

  const merges = await db.campaignEntityMerge.findMany({
    where: { campaignId: campaign.id },
    select: { mergedEntityId: true, survivorEntityId: true, status: true },
  });
  const entityIds = entities.map((e) => e.id);
  // Codex parity (withEntityStats): a merged-away identity's mentions count
  // toward its ultimate EXECUTED survivor, not the shallow copy — otherwise
  // pickDefaultSurvivor could crown a copy that never itself absorbed the
  // campaign's real activity over the entity that actually did.
  const survivorOf = buildSurvivorMap(merges, entityIds);
  const stats = await loadCampaignStats(db, campaign.id, userId, entityIds, survivorOf);

  const enriched = enrichEntities(entities, stats);
  const rows = buildDuplicateRows(campaign, enriched, merges);
  const chronicling = buildNeedsChroniclingRow(campaign, enriched);
  return chronicling ? [...rows, chronicling] : rows;
}

// Every derived row across every campaign `userId` OWNS, newest-signal first.
export async function buildInboxRows(db: PrismaClient, userId: string): Promise<InboxRow[]> {
  const campaigns = await db.campaign.findMany({ where: { ownerId: userId }, select: { id: true, name: true } });
  const perCampaign = await Promise.all(campaigns.map((c) => buildCampaignInboxRows(db, c, userId)));
  return perCampaign.flat().sort((a, b) => Date.parse(b.signalAt) - Date.parse(a.signalAt));
}

// Drops rows this user already dismissed under this exact (kind, signature).
export function filterDismissed(
  rows: InboxRow[],
  dismissed: { kind: string; signature: string }[],
): InboxRow[] {
  const dismissedKeys = new Set(dismissed.map((d) => `${d.kind} ${d.signature}`));
  return rows.filter((r) => !dismissedKeys.has(`${r.kind} ${r.signature}`));
}

// POST /api/inbox/dismissals cross-campaign guard (#1945 review): a
// dismissal's signature is a comma-joined list of entity ids
// (clusterSignature); this validates every one of them actually belongs to
// the campaign the caller says it does, so an owner of campaigns A and B
// can't file a dismissal FK'd to A whose signature actually suppresses a row
// in B (and whose cascade-cleanup would then be wrong when A is deleted).
export async function signatureBelongsToCampaign(
  db: PrismaClient,
  campaignId: string,
  signature: string,
): Promise<boolean> {
  const ids = signature.split(",").filter((id) => id.length > 0);
  if (ids.length === 0) return false;
  const count = await db.campaignEntity.count({ where: { id: { in: ids }, campaignId } });
  return count === ids.length;
}
