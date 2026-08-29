// Merged-away refs redirect to their ultimate EXECUTED survivor (buildSurvivorMap) before folding, so pickDefaultSurvivor can't prefer a shallow copy over the entity that actually absorbed the activity.

import { resolveSurvivorChain, type MergeEdge } from "@/lib/activity/entity-merges.js";

export interface MentionRef {
  entityId: string;
  date: Date;
}

export interface MentionStats {
  mentionCount: number;
  lastMentionedAt: Date;
}

// Present only for an entity that IS EXECUTED-merged into something; an unmerged or PREPARED-only entity has no entry, so callers fall back to its own id.
export function buildSurvivorMap(edges: MergeEdge[], entityIds: string[]): Map<string, string> {
  const survivorOf = new Map<string, string>();
  for (const id of entityIds) {
    const chain = resolveSurvivorChain(edges, id, { executedOnly: true });
    if (chain.length > 0) survivorOf.set(id, chain[chain.length - 1]);
  }
  return survivorOf;
}

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
