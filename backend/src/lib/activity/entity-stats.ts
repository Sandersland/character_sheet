// Derived mention stats for campaign entities (#839); recency = date → loggedAt → createdAt (backlinks parity).

import type { Prisma } from "@/generated/prisma/client.js";

import {
  collectMergedInIdentities,
  resolveSurvivorChain,
  type MergeEdge,
} from "./entity-merges.js";
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

function compareRefRecency(a: StatRef, b: StatRef): number {
  return (
    a.date.getTime() - b.date.getTime() ||
    a.loggedAt.getTime() - b.loggedAt.getTime() ||
    a.createdAt.getTime() - b.createdAt.getTime()
  );
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, make: () => V): V {
  const existing = map.get(key);
  if (existing) return existing;
  const created = make();
  map.set(key, created);
  return created;
}

interface StatsAccumulator extends EntityStatsAggregate {
  entryIds: Set<string>;
  chroniclerSet: Set<string>;
}

function newStatsAccumulator(): StatsAccumulator {
  return {
    mentionCount: 0,
    firstMentioned: null,
    lastMentioned: null,
    chroniclers: [],
    entryIds: new Set(),
    chroniclerSet: new Set(),
  };
}

function foldRef(acc: StatsAccumulator, ref: StatRef): void {
  acc.mentionCount += 1;
  if (!acc.firstMentioned || compareRefRecency(ref, acc.firstMentioned) < 0) {
    acc.firstMentioned = ref;
  }
  if (!acc.lastMentioned || compareRefRecency(ref, acc.lastMentioned) > 0) {
    acc.lastMentioned = ref;
  }
  if (!acc.chroniclerSet.has(ref.characterName)) {
    acc.chroniclerSet.add(ref.characterName);
    acc.chroniclers.push(ref.characterName);
  }
}

// Fold refs into per-survivor stats; entries counted once even when dual-tagged.
export function aggregateEntityStats(
  refs: StatRef[],
  opts: { survivorOf?: ReadonlyMap<string, string> } = {},
): Map<string, EntityStatsAggregate> {
  const stats = new Map<string, StatsAccumulator>();
  for (const ref of refs) {
    const survivor = opts.survivorOf?.get(ref.entityId) ?? ref.entityId;
    const acc = getOrCreate(stats, survivor, newStatsAccumulator);
    if (acc.entryIds.has(ref.entryId)) continue;
    acc.entryIds.add(ref.entryId);
    foldRef(acc, ref);
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

function visibleEntity<E extends { visibility: string }>(
  byId: ReadonlyMap<string, E>,
  id: string,
  isOwner: boolean,
): E | null {
  const entity = byId.get(id);
  return entity && (isOwner || entity.visibility !== "HIDDEN") ? entity : null;
}

// Co-mention tally (#839): distinct entries per ultimate EXECUTED survivor, desc.
export function tallyCoMentions<E extends { id: string; name: string; visibility: string }>(
  refs: { entryId: string; entityId: string }[],
  opts: {
    edges: MergeEdge[];
    entityById: ReadonlyMap<string, E>;
    targetIds: ReadonlySet<string>;
    isOwner: boolean;
  },
): { entity: E; count: number }[] {
  const entriesBySurvivor = new Map<string, Set<string>>();
  for (const ref of refs) {
    if (opts.targetIds.has(ref.entityId)) continue;
    if (!visibleEntity(opts.entityById, ref.entityId, opts.isOwner)) continue;
    const chain = resolveSurvivorChain(opts.edges, ref.entityId, { executedOnly: true });
    const survivorId = chain[chain.length - 1] ?? ref.entityId;
    if (opts.targetIds.has(survivorId)) continue;
    if (!visibleEntity(opts.entityById, survivorId, opts.isOwner)) continue;
    getOrCreate(entriesBySurvivor, survivorId, () => new Set<string>()).add(ref.entryId);
  }
  return [...entriesBySurvivor.entries()]
    .map(([survivorId, entryIds]) => ({
      entity: opts.entityById.get(survivorId)!,
      count: entryIds.size,
    }))
    .sort((a, b) => b.count - a.count || a.entity.name.localeCompare(b.entity.name));
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
