import { normalizeForMatch } from "@/lib/mentions";
import type { CampaignEntity, EntityStats, EntityType } from "@/types/character";

// Pure helpers for the codex ledger browse surface (#840) — no JSX, no DOM.

export type CodexSort = "alpha" | "recent" | "mentions";

// Mention-based sorts stay disabled until per-entity stats land (#839).
export const CODEX_SORT_OPTIONS: { value: CodexSort; label: string; disabled: boolean }[] = [
  { value: "alpha", label: "A → Z", disabled: false },
  { value: "recent", label: "Recently mentioned", disabled: true },
  { value: "mentions", label: "Most mentioned", disabled: true },
];

export interface LetterGroup {
  letter: string;
  entities: CampaignEntity[];
}

// Divider letter for a name: normalized initial A–Z, else the "#" bucket.
function initialOf(name: string): string {
  const first = normalizeForMatch(name).charAt(0);
  return /[a-z]/.test(first) ? first.toUpperCase() : "#";
}

// A→Z letter groups (entities sorted by name inside each), "#" bucket last.
export function groupByInitial(entities: CampaignEntity[]): LetterGroup[] {
  const buckets = new Map<string, CampaignEntity[]>();
  const sorted = [...entities].sort((a, b) => a.name.localeCompare(b.name));
  for (const e of sorted) {
    const letter = initialOf(e.name);
    buckets.set(letter, [...(buckets.get(letter) ?? []), e]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)))
    .map(([letter, list]) => ({ letter, entities: list }));
}

export function typeCounts(entities: CampaignEntity[]): Record<EntityType, number> {
  const counts: Record<EntityType, number> = {
    NPC: 0,
    LOCATION: 0,
    FACTION: 0,
    ITEM: 0,
    PC: 0,
    OTHER: 0,
  };
  for (const e of entities) counts[e.type] += 1;
  return counts;
}

// First non-empty line of the notes, trimmed — the ledger row's one-line snippet.
export function notesSnippet(notes: string | null): string | null {
  const first = notes
    ?.split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  return first ?? null;
}

export function monogram(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

// An entity from a `?include=stats` list, with stats guaranteed present.
export type StatsEntity = CampaignEntity & { stats: EntityStats };

function withStats(entities: CampaignEntity[]): StatsEntity[] {
  return entities.filter((e): e is StatsEntity => e.stats !== undefined);
}

// Mentioned-but-descriptionless entities for the "Needs chronicling" card, most-mentioned first.
export function needsChronicling(entities: CampaignEntity[]): StatsEntity[] {
  return withStats(entities)
    .filter((e) => e.stats.mentionCount > 0 && !e.stats.hasDescription)
    .sort((a, b) => b.stats.mentionCount - a.stats.mentionCount);
}

// Top-n leaderboard by mention count (name tiebreak); zero-mention entities drop out.
export function mostMentioned(entities: CampaignEntity[], n = 3): StatsEntity[] {
  return withStats(entities)
    .filter((e) => e.stats.mentionCount > 0)
    .sort(
      (a, b) => b.stats.mentionCount - a.stats.mentionCount || a.name.localeCompare(b.name),
    )
    .slice(0, n);
}
