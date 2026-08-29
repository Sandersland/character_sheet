import { normalizeForMatch } from "@/lib/activity/journal-refs.js";

export interface ClusterableEntity {
  id: string;
  name: string;
}

export interface SurvivorCandidate {
  id: string;
  mentionCount: number;
  createdAt: Date;
}

export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + cost);
      diagonal = temp;
    }
  }
  return prev[b.length];
}

function matchThreshold(a: string, b: string): number {
  return Math.min(a.length, b.length) >= 4 ? 2 : 1;
}

function digitsOf(s: string): string {
  return s.replace(/\D/g, "");
}

// A differing digit run means deliberately distinct instances ("Guard 1" vs "Guard 2"), never a typo — checked before the distance threshold so it overrides a match.
function hasConflictingDigits(a: string, b: string): boolean {
  const digitsA = digitsOf(a);
  const digitsB = digitsOf(b);
  return digitsA !== "" && digitsB !== "" && digitsA !== digitsB;
}

// Never a duplicate: a conflicting digit run, a folded name under 2 chars (too little signal — "A"/"B" would always match), or a length gap wider than the threshold (distance is at least the length gap, so a wider gap can never land within it — skips the editDistance DP).
function isNeverDuplicate(foldedA: string, foldedB: string): boolean {
  if (hasConflictingDigits(foldedA, foldedB)) return true;
  if (Math.min(foldedA.length, foldedB.length) < 2) return true;
  return Math.abs(foldedA.length - foldedB.length) > matchThreshold(foldedA, foldedB);
}

// Takes already-folded strings — the hot path for buildDuplicateClusters, which folds every name once up front rather than per pair.
function isDuplicateFolded(foldedA: string, foldedB: string): boolean {
  if (foldedA === foldedB) return true;
  if (isNeverDuplicate(foldedA, foldedB)) return false;
  return editDistance(foldedA, foldedB) <= matchThreshold(foldedA, foldedB);
}

export function isDuplicatePair(nameA: string, nameB: string): boolean {
  return isDuplicateFolded(normalizeForMatch(nameA), normalizeForMatch(nameB));
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

// Any CampaignEntityMerge status counts — even a PREPARED pair is never flagged as a typo duplicate; it already has its own resolution flow.
export function buildMergeExclusionSet(
  merges: { mergedEntityId: string; survivorEntityId: string }[],
): Set<string> {
  return new Set(merges.map((m) => pairKey(m.mergedEntityId, m.survivorEntityId)));
}

class UnionFind {
  private readonly parent = new Map<string, string>();

  find(id: string): string {
    const parent = this.parent.get(id) ?? id;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootA, rootB);
  }
}

interface FoldedEntity extends ClusterableEntity {
  folded: string;
}

// Fold every name exactly once, up front — the O(n^2) loop below then reads `.folded` instead of re-running normalizeForMatch per pair.
function foldEntities(entities: ClusterableEntity[]): FoldedEntity[] {
  return entities.map((e) => ({ ...e, folded: normalizeForMatch(e.name) }));
}

// O(1)-per-entity pre-pass: entities sharing an EXACT folded name union immediately, skipping the distance machinery — still exclusion-gated, so an identity-merged pair never unions even on an exact collision.
function bucketExactFolds(uf: UnionFind, entities: FoldedEntity[], excludedPairs: ReadonlySet<string>): void {
  const repByFold = new Map<string, string>();
  for (const e of entities) {
    const rep = repByFold.get(e.folded);
    if (rep === undefined) {
      repByFold.set(e.folded, e.id);
    } else if (!excludedPairs.has(pairKey(rep, e.id))) {
      uf.union(rep, e.id);
    }
  }
}

function maybeUnionPair(
  uf: UnionFind,
  a: FoldedEntity,
  b: FoldedEntity,
  excludedPairs: ReadonlySet<string>,
): void {
  if (uf.find(a.id) === uf.find(b.id)) return;
  if (excludedPairs.has(pairKey(a.id, b.id))) return;
  if (isDuplicateFolded(a.folded, b.folded)) uf.union(a.id, b.id);
}

function groupByRoot(uf: UnionFind, entities: ClusterableEntity[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const e of entities) {
    const root = uf.find(e.id);
    const list = groups.get(root);
    if (list) list.push(e.id);
    else groups.set(root, [e.id]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

// O(n^2) over one campaign's entities is fine — counts are small (Codex-browsable) and the short-circuits above keep per-pair cost cheap.
// excludedPairs is checked before the name match so a merged pair is never unioned in the first place.
export function buildDuplicateClusters(
  entities: ClusterableEntity[],
  excludedPairs: ReadonlySet<string>,
): string[][] {
  const folded = foldEntities(entities);
  const uf = new UnionFind();
  bucketExactFolds(uf, folded, excludedPairs);
  for (let i = 0; i < folded.length; i++) {
    for (let j = i + 1; j < folded.length; j++) {
      maybeUnionPair(uf, folded[i], folded[j], excludedPairs);
    }
  }
  return groupByRoot(uf, entities);
}

// InboxDismissal.signature: sorted so member order never matters; a membership change produces a different signature and resurfaces post-dismissal (intended).
export function clusterSignature(entityIds: string[]): string {
  return [...entityIds].sort().join(",");
}

function compareSurvivor(a: SurvivorCandidate, b: SurvivorCandidate): number {
  return b.mentionCount - a.mentionCount || a.createdAt.getTime() - b.createdAt.getTime();
}

// Default survivor = most-mentioned; ties break to the oldest (first-created).
export function pickDefaultSurvivor(candidates: SurvivorCandidate[]): string {
  return candidates.reduce((best, c) => (compareSurvivor(c, best) < 0 ? c : best)).id;
}
