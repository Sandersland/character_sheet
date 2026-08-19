// Pure, DB-free mention-stats folding for GET /api/inbox (#1945 review): the
// inbox needs only a per-entity mention count and last-mention date, not the
// full aggregateEntityStats/EntityStatsAggregate shape (chroniclers,
// first-mentioned, session context) — that's Codex-page display data the
// inbox never renders. A merged-away identity's refs redirect to its
// ultimate EXECUTED survivor (buildSurvivorMap) before folding, so
// pickDefaultSurvivor can't prefer a shallow copy that never itself absorbed
// the campaign's real activity over the entity that actually did.

import { resolveSurvivorChain, type MergeEdge } from "@/lib/activity/entity-merges.js";

export interface MentionRef {
  entityId: string;
  date: Date;
}

export interface MentionStats {
  mentionCount: number;
  lastMentionedAt: Date;
}

// entityId -> its ultimate EXECUTED survivor id. Present only for an entity
// that IS merged into something; an unmerged (or only PREPARED-merged)
// entity has no entry, so callers fall back to the entity's own id.
export function buildSurvivorMap(edges: MergeEdge[], entityIds: string[]): Map<string, string> {
  const survivorOf = new Map<string, string>();
  for (const id of entityIds) {
    const chain = resolveSurvivorChain(edges, id, { executedOnly: true });
    if (chain.length > 0) survivorOf.set(id, chain[chain.length - 1]);
  }
  return survivorOf;
}

// Folds raw refs into per-entity stats, redirecting a merged-away identity's
// refs onto survivorOf's target so mentions accumulate at the canonical
// entity instead of staying stranded on the old identity.
export function foldMentionStats(
  refs: MentionRef[],
  survivorOf: ReadonlyMap<string, string>,
): Map<string, MentionStats> {
  const stats = new Map<string, MentionStats>();
  for (const ref of refs) {
    const id = survivorOf.get(ref.entityId) ?? ref.entityId;
    const existing = stats.get(id);
    if (!existing) {
      stats.set(id, { mentionCount: 1, lastMentionedAt: ref.date });
      continue;
    }
    existing.mentionCount += 1;
    if (ref.date > existing.lastMentionedAt) existing.lastMentionedAt = ref.date;
  }
  return stats;
}
