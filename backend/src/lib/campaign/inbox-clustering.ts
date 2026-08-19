// Pure, DB-free duplicate-name clustering for GET /api/inbox (#1945). Names
// fold via normalizeForMatch (same rule as search/backlinks) and union across
// a Levenshtein edit-distance threshold: <=2 for folded names >=4 chars,
// <=1 below — a shorter name tolerates less noise before two names stop
// meaning "the same typo" and start meaning "a different word". Two more
// guards keep that threshold from over-firing: a folded name under 2 chars
// never pairs by distance alone (only an exact fold match), and a pair whose
// digit runs disagree ("Guard 1"/"Guard 2", "Room 101"/"Room 102") is never a
// duplicate regardless of distance — a differing number is the point of the
// name, not noise. Every export stays CC <= 4 (fallow gate) so this file is
// unit-testable without Postgres.

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

// Iterative-DP Levenshtein distance (single-row rolling buffer).
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

// All digits in a folded name, in order — "room 101" -> "101". A name with no
// digits contributes nothing to the comparison (empty string).
function digitsOf(s: string): string {
  return s.replace(/\D/g, "");
}

// A differing digit run means the names are deliberately distinct instances
// ("Guard 1" vs "Guard 2", "Room 101" vs "Room 102"), never a typo of each
// other — checked before the distance threshold so it overrides a match.
function hasConflictingDigits(a: string, b: string): boolean {
  const digitsA = digitsOf(a);
  const digitsB = digitsOf(b);
  return digitsA !== "" && digitsB !== "" && digitsA !== digitsB;
}

// A pair distance-based matching can never call a duplicate: a differing
// digit run (a deliberately distinct instance, not noise), a folded name
// under 2 chars (too little signal for distance alone — "A"/"B" are 1 apart
// and would otherwise always match), or a length gap wider than the
// threshold allows (distance is at least the length gap, so a wider gap can
// never land within threshold — skips the editDistance DP entirely).
function isNeverDuplicate(foldedA: string, foldedB: string): boolean {
  if (hasConflictingDigits(foldedA, foldedB)) return true;
  if (Math.min(foldedA.length, foldedB.length) < 2) return true;
  return Math.abs(foldedA.length - foldedB.length) > matchThreshold(foldedA, foldedB);
}

// Same rule as isDuplicatePair, taking already-folded strings — the hot path
// for buildDuplicateClusters, which folds every name once up front rather
// than per pair.
function isDuplicateFolded(foldedA: string, foldedB: string): boolean {
  if (foldedA === foldedB) return true;
  if (isNeverDuplicate(foldedA, foldedB)) return false;
  return editDistance(foldedA, foldedB) <= matchThreshold(foldedA, foldedB);
}

// Two names are the "same" entity for clustering purposes — see
// isDuplicateFolded for the exact rule.
export function isDuplicatePair(nameA: string, nameB: string): boolean {
  return isDuplicateFolded(normalizeForMatch(nameA), normalizeForMatch(nameB));
}

// Order-independent pair identity for a merge-exclusion / already-unioned set.
// Module-private: callers hold only the Set buildMergeExclusionSet returns.
function pairKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

// Every (mergedEntityId, survivorEntityId) pair, any CampaignEntityMerge
// status — an identity-merged pair (even just PREPARED) is never a "typo
// duplicate" flag, it already has its own dedicated resolution flow (#387).
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

// Fold every name exactly once, up front — the O(n^2) loop below then reads
// `.folded` instead of re-running normalizeForMatch per pair.
function foldEntities(entities: ClusterableEntity[]): FoldedEntity[] {
  return entities.map((e) => ({ ...e, folded: normalizeForMatch(e.name) }));
}

// O(1)-per-entity pre-pass: entities sharing an EXACT folded name union
// immediately, skipping the distance machinery entirely for the common case.
// Still exclusion-gated — an identity-merged pair never unions even on an
// exact name collision.
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

// O(n^2) pairwise union over one campaign's entities — campaign entity counts
// are small (Codex-browsable), so this stays well within a request budget;
// bucketExactFolds and maybeUnionPair's already-unioned/length-gap/digit
// short-circuits keep the per-pair cost cheap for everything but genuine
// near-duplicate candidates. `excludedPairs` (from buildMergeExclusionSet) is
// checked before the name match so a merged pair is never unioned in the
// first place, matching "excluded regardless of status".
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

// Stable cluster identity for InboxDismissal.signature: sorted so member
// order never matters, joined so a membership CHANGE (new id added/removed)
// produces a different signature and resurfaces post-dismissal (intended).
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
