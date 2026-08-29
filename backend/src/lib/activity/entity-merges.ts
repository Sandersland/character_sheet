// All functions are DB-free so route + reconciliation logic can be unit-tested without Postgres.

export type MergeStatus = "PREPARED" | "EXECUTED";

export interface MergeEdge {
  mergedEntityId: string;
  survivorEntityId: string;
  status: MergeStatus;
}

interface ChainOpts {
  executedOnly?: boolean;
}

function edgeIncluded(edge: MergeEdge, opts: ChainOpts): boolean {
  return opts.executedOnly ? edge.status === "EXECUTED" : true;
}

// A visited guard makes a malformed cycle terminate instead of looping.
export function resolveSurvivorChain(
  merges: MergeEdge[],
  entityId: string,
  opts: ChainOpts = {},
): string[] {
  const chain: string[] = [];
  const visited = new Set<string>([entityId]);
  let current = entityId;
  for (;;) {
    const edge = merges.find(
      (m) => m.mergedEntityId === current && edgeIncluded(m, opts),
    );
    if (!edge || visited.has(edge.survivorEntityId)) break;
    chain.push(edge.survivorEntityId);
    visited.add(edge.survivorEntityId);
    current = edge.survivorEntityId;
  }
  return chain;
}

// Every identity that merged transitively INTO survivorId, excluding survivorId itself.
export function collectMergedInIdentities(
  merges: MergeEdge[],
  survivorId: string,
  opts: ChainOpts = {},
): string[] {
  const collected: string[] = [];
  const visited = new Set<string>([survivorId]);
  const frontier = [survivorId];
  while (frontier.length > 0) {
    const node = frontier.shift()!;
    for (const edge of merges) {
      if (edge.survivorEntityId !== node || !edgeIncluded(edge, opts)) continue;
      if (visited.has(edge.mergedEntityId)) continue;
      visited.add(edge.mergedEntityId);
      collected.push(edge.mergedEntityId);
      frontier.push(edge.mergedEntityId);
    }
  }
  return collected;
}

// Considers merges of any status (PREPARED or EXECUTED), not just executed ones.
export function wouldCreateCycle(
  merges: MergeEdge[],
  mergedEntityId: string,
  survivorEntityId: string,
): boolean {
  if (mergedEntityId === survivorEntityId) return true;
  return resolveSurvivorChain(merges, survivorEntityId).includes(mergedEntityId);
}
