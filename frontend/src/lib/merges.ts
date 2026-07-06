// Pure helpers for entity identity merges (#387), in parity with the backend
// lib/entity-merges.ts. Operate on the flat merge list the API returns plus an
// id→entity map, resolving transitive "revealed to be" chains for the UI.

import type { CampaignEntity, CampaignEntityMerge } from "@/types/character";

interface ChainOpts {
  executedOnly?: boolean;
}

function included(m: CampaignEntityMerge, opts: ChainOpts): boolean {
  return opts.executedOnly ? m.status === "EXECUTED" : true;
}

// Ordered survivor ids up the chain from `entityId` (nearest identity first).
export function resolveSurvivorChain(
  merges: CampaignEntityMerge[],
  entityId: string,
  opts: ChainOpts = {},
): string[] {
  const chain: string[] = [];
  const visited = new Set<string>([entityId]);
  let current = entityId;
  for (;;) {
    const edge = merges.find((m) => m.mergedEntityId === current && included(m, opts));
    if (!edge || visited.has(edge.survivorEntityId)) break;
    chain.push(edge.survivorEntityId);
    visited.add(edge.survivorEntityId);
    current = edge.survivorEntityId;
  }
  return chain;
}

// Every identity that merged transitively INTO `survivorId` (nearest first).
export function collectMergedInIdentities(
  merges: CampaignEntityMerge[],
  survivorId: string,
  opts: ChainOpts = {},
): string[] {
  const collected: string[] = [];
  const visited = new Set<string>([survivorId]);
  const frontier = [survivorId];
  while (frontier.length > 0) {
    const node = frontier.shift()!;
    for (const m of merges) {
      if (m.survivorEntityId !== node || !included(m, opts)) continue;
      if (visited.has(m.mergedEntityId)) continue;
      visited.add(m.mergedEntityId);
      collected.push(m.mergedEntityId);
      frontier.push(m.mergedEntityId);
    }
  }
  return collected;
}

// The merge in which `entityId` is the old (merged) identity, if any.
export function mergeForMerged(
  merges: CampaignEntityMerge[],
  entityId: string,
): CampaignEntityMerge | undefined {
  return merges.find((m) => m.mergedEntityId === entityId);
}

// The ultimate survivor's name for an EXECUTED-merged identity — the autocomplete
// annotation ("Jenkins → Vecna"). Empty string when not merged or unresolved.
export function ultimateSurvivorName(
  merges: CampaignEntityMerge[],
  byId: Map<string, CampaignEntity>,
  entityId: string,
): string {
  const chain = resolveSurvivorChain(merges, entityId, { executedOnly: true });
  const top = chain.at(-1);
  return top ? byId.get(top)?.name ?? "" : "";
}
