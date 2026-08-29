// Nothing about a row is persisted — only that a user dismissed one (InboxDismissal), filtered in by the route.

import type { EntityType, EntityVisibility, PrismaClient } from "@/generated/prisma/client.js";
import { visibleEntryWhere } from "@/lib/activity/entity-stats.js";
import { hasDescription } from "./entities.js";
import { buildSurvivorMap, foldMentionStats, type MentionRef, type MentionStats } from "./inbox-stats.js";
import {
  buildDuplicateClusters,
  buildMergeExclusionSet,
  clusterSignature,
  pickDefaultSurvivor,
} from "./inbox-clustering.js";

export interface InboxDuplicateEntity {
  id: string;
  name: string;
  type: EntityType;
  visibility: EntityVisibility;
  mentionCount: number;
}

export interface InboxDuplicateClusterRow {
  kind: "DUPLICATE_CLUSTER";
  campaignId: string;
  campaignName: string;
  signature: string;
  entities: InboxDuplicateEntity[];
  defaultSurvivorId: string;
  /** ISO timestamp this row sorts by. */
  signalAt: string;
}

export interface InboxNeedsChroniclingRow {
  kind: "NEEDS_CHRONICLING";
  campaignId: string;
  campaignName: string;
  signature: string;
  count: number;
  /** ISO timestamp this row sorts by. */
  signalAt: string;
}

export type InboxRow = InboxDuplicateClusterRow | InboxNeedsChroniclingRow;

type EntityRow = {
  id: string;
  name: string;
  type: EntityType;
  visibility: EntityVisibility;
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

// Removed entirely (not just pairwise-excluded) so it can't re-enter a cluster transitively through a third, unrelated near-duplicate; needs-chronicling needs no equivalent filter since its mentionCount is already 0 post-attribution (see buildNeedsChroniclingRow).
function excludeExecutedMergedAway<E extends { id: string }>(
  entities: E[],
  merges: { mergedEntityId: string; status: string }[],
): E[] {
  const mergedAway = new Set(merges.filter((m) => m.status === "EXECUTED").map((m) => m.mergedEntityId));
  return entities.filter((e) => !mergedAway.has(e.id));
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

// Safe only because buildCampaignInboxRows always runs foldMentionStats before enrichEntities, redirecting a merged-away entity's mentions onto its EXECUTED survivor — so its own mentionCount is always 0 and the `e.mentionCount > 0` filter below excludes it for free. Breaks silently if that ordering or foldMentionStats's redirect ever changes.
function buildNeedsChroniclingRow(
  campaign: { id: string; name: string },
  entities: EnrichedEntity[],
): InboxNeedsChroniclingRow | null {
  const flagged = entities.filter((e) => e.mentionCount > 0 && !hasDescription(e.notes));
  if (flagged.length === 0) return null;
  // Same resurface-on-membership-change contract as clusterSignature: a newly-flagged or newly-described entity changes the id list, so a prior dismissal on the OLD set doesn't permanently mute this.
  return {
    kind: "NEEDS_CHRONICLING",
    campaignId: campaign.id,
    campaignName: campaign.name,
    signature: clusterSignature(flagged.map((e) => e.id)),
    count: flagged.length,
    signalAt: latestOf(flagged.map(entitySignalDate)).toISOString(),
  };
}

// Returns raw refs, not yet folded: folding needs survivorOf, which depends on the merges query running alongside this one via Promise.all, not sequentially after it.
async function loadCampaignRefs(
  db: PrismaClient,
  campaignId: string,
  userId: string,
  entityIds: string[],
): Promise<MentionRef[]> {
  if (entityIds.length === 0) return [];
  const refRows = await db.journalEntryRef.findMany({
    where: { entityId: { in: entityIds }, entry: visibleEntryWhere(userId, campaignId) },
    select: { entityId: true, entry: { select: { date: true } } },
  });
  return refRows.map((r) => ({ entityId: r.entityId, date: r.entry.date }));
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

  // merges and refs are independent reads once entityIds is known — running them together halves this function's DB round-trip latency.
  const entityIds = entities.map((e) => e.id);
  const [merges, refs] = await Promise.all([
    db.campaignEntityMerge.findMany({
      where: { campaignId: campaign.id },
      select: { mergedEntityId: true, survivorEntityId: true, status: true },
    }),
    loadCampaignRefs(db, campaign.id, userId, entityIds),
  ]);

  // Matches Codex's withEntityStats: merged-away mentions count toward the EXECUTED survivor, not the shallow copy.
  const survivorOf = buildSurvivorMap(merges, entityIds);
  const stats = foldMentionStats(refs, survivorOf);

  const enriched = enrichEntities(entities, stats);
  const clusterCandidates = excludeExecutedMergedAway(enriched, merges);
  const rows = buildDuplicateRows(campaign, clusterCandidates, merges);
  const chronicling = buildNeedsChroniclingRow(campaign, enriched);
  return chronicling ? [...rows, chronicling] : rows;
}

export async function buildInboxRows(db: PrismaClient, userId: string): Promise<InboxRow[]> {
  const campaigns = await db.campaign.findMany({ where: { ownerId: userId }, select: { id: true, name: true } });
  const perCampaign = await Promise.all(campaigns.map((c) => buildCampaignInboxRows(db, c, userId)));
  return perCampaign.flat().sort((a, b) => Date.parse(b.signalAt) - Date.parse(a.signalAt));
}

// Matches InboxDismissal's own @@unique(campaignId, kind, signature) — so a dismissal never silently suppresses a same-signature row in a DIFFERENT campaign.
export function filterDismissed(
  rows: InboxRow[],
  dismissed: { campaignId: string; kind: string; signature: string }[],
): InboxRow[] {
  const dismissedKeys = new Set(dismissed.map((d) => `${d.campaignId} ${d.kind} ${d.signature}`));
  return rows.filter((r) => !dismissedKeys.has(`${r.campaignId} ${r.kind} ${r.signature}`));
}

// Validates every id in the comma-joined signature (clusterSignature) belongs to this campaign, so an owner of campaigns A and B can't FK a dismissal to A that actually suppresses a row in B.
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
