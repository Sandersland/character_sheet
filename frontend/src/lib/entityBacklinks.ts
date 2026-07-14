import type { EntityBacklink } from "@/types/character";

// One chronicle section (#842): a session (or the "none" bucket) with its
// context and entries, dated by its first (newest) item.
export interface ChronicleGroup {
  key: string;
  sessionId: string | null;
  sessionTitle: string | null;
  sessionOrdinal: number | null;
  date: string;
  items: EntityBacklink[];
}

// Session-primary chronicle grouping (#842), preserving API newest-first order.
export function chronicleGroups(backlinks: EntityBacklink[]): ChronicleGroup[] {
  const groups = new Map<string, ChronicleGroup>();
  for (const link of backlinks) {
    const key = link.entry.sessionId ?? "none";
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(link);
      continue;
    }
    groups.set(key, {
      key,
      sessionId: link.entry.sessionId ?? null,
      sessionTitle: link.entry.sessionTitle ?? null,
      sessionOrdinal: link.entry.sessionOrdinal ?? null,
      date: link.entry.date,
      items: [link],
    });
  }
  return [...groups.values()];
}

// Cap the chronicle at the latest few session groups; the rest sit behind an expander.
export function splitChronicle(
  groups: ChronicleGroup[],
  visibleCount = 3,
): { visible: ChronicleGroup[]; hidden: ChronicleGroup[] } {
  return { visible: groups.slice(0, visibleCount), hidden: groups.slice(visibleCount) };
}

