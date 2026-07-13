// Derived mention stats for campaign entities (#839); recency = date → loggedAt → createdAt (backlinks parity).

import type { Prisma } from "@/generated/prisma/client.js";

import { collectMergedInIdentities, type MergeEdge } from "./entity-merges.js";
import { normalizeForMatch } from "./journal-refs.js";

// The #838 sharing rule: own entries + CAMPAIGN ones from characters still in the campaign.
export function visibleEntryWhere(
  userId: string,
  campaignId: string,
): Prisma.JournalEntryWhereInput {
  return {
    OR: [
      { authorUserId: userId },
      { visibility: "CAMPAIGN", character: { campaignId } },
    ],
  };
}

// Sessions must arrive pre-ordered by startedAt asc; ordinals are 1-based.
export function buildSessionOrdinalMap(sessions: { id: string }[]): Map<string, number> {
  return new Map(sessions.map((s, i) => [s.id, i + 1]));
}

export interface StatRef {
  entityId: string;
  entryId: string;
  characterName: string;
  sessionId: string | null;
  date: Date;
  loggedAt: Date;
  createdAt: Date;
}

export interface EntityStatsAggregate {
  mentionCount: number;
  firstMentioned: StatRef | null;
  lastMentioned: StatRef | null;
  chroniclers: string[];
}

export function compareRefRecency(a: StatRef, b: StatRef): number {
  return (
    a.date.getTime() - b.date.getTime() ||
    a.loggedAt.getTime() - b.loggedAt.getTime() ||
    a.createdAt.getTime() - b.createdAt.getTime()
  );
}

// Fold refs into per-survivor stats; entries counted once even when dual-tagged.
export function aggregateEntityStats(
  refs: StatRef[],
  opts: { survivorOf?: ReadonlyMap<string, string> } = {},
): Map<string, EntityStatsAggregate> {
  const stats = new Map<string, EntityStatsAggregate>();
  const seenEntries = new Map<string, Set<string>>();
  const chroniclerSets = new Map<string, Set<string>>();

  for (const ref of refs) {
    const survivor = opts.survivorOf?.get(ref.entityId) ?? ref.entityId;
    let seen = seenEntries.get(survivor);
    if (!seen) {
      seen = new Set();
      seenEntries.set(survivor, seen);
    }
    if (seen.has(ref.entryId)) continue;
    seen.add(ref.entryId);

    let agg = stats.get(survivor);
    if (!agg) {
      agg = { mentionCount: 0, firstMentioned: null, lastMentioned: null, chroniclers: [] };
      stats.set(survivor, agg);
      chroniclerSets.set(survivor, new Set());
    }
    agg.mentionCount += 1;
    if (!agg.firstMentioned || compareRefRecency(ref, agg.firstMentioned) < 0) {
      agg.firstMentioned = ref;
    }
    if (!agg.lastMentioned || compareRefRecency(ref, agg.lastMentioned) > 0) {
      agg.lastMentioned = ref;
    }
    const names = chroniclerSets.get(survivor)!;
    if (!names.has(ref.characterName)) {
      names.add(ref.characterName);
      agg.chroniclers.push(ref.characterName);
    }
  }
  return stats;
}

// Per-survivor EXECUTED merge union; non-owners never see a HIDDEN identity's refs.
export function resolveVisibleMergeUnion(
  edges: MergeEdge[],
  targetIds: string[],
  revealedIds: ReadonlySet<string>,
  isOwner: boolean,
): Map<string, string[]> {
  const union = new Map<string, string[]>();
  for (const id of targetIds) {
    const mergedIn = collectMergedInIdentities(edges, id, { executedOnly: true });
    union.set(id, isOwner ? mergedIn : mergedIn.filter((m) => revealedIds.has(m)));
  }
  return union;
}

export type EntityMatchField = "name" | "alias" | "notes";

// Precedence name → alias → notes, all via normalizeForMatch.
export function matchEntityQuery(
  entity: { name: string; aliases: string[]; notes: string | null },
  q: string,
): EntityMatchField | null {
  const nq = normalizeForMatch(q);
  if (!nq) return null;
  if (normalizeForMatch(entity.name).includes(nq)) return "name";
  if (entity.aliases.some((a) => normalizeForMatch(a).includes(nq))) return "alias";
  if (entity.notes && normalizeForMatch(entity.notes).includes(nq)) return "notes";
  return null;
}
