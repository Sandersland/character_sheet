import type { EntityBacklink } from "@/types/character";

// Group backlinks by their source session (preserving the newest-first order the
// API returns); a null sessionId collects under the "none" key.
export function groupBySession(
  backlinks: EntityBacklink[],
): { key: string; items: EntityBacklink[] }[] {
  const groups = new Map<string, EntityBacklink[]>();
  for (const link of backlinks) {
    const key = link.entry.sessionId ?? "none";
    const items = groups.get(key) ?? [];
    items.push(link);
    groups.set(key, items);
  }
  return [...groups.entries()].map(([key, items]) => ({ key, items }));
}

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

// Group backlinks by the tagged identity (#387), first-seen order. On a survivor
// page a merged-in identity's entries collect under that identity.
export function groupByIdentity(
  backlinks: EntityBacklink[],
): { id: string; name: string; items: EntityBacklink[] }[] {
  const groups = new Map<string, { id: string; name: string; items: EntityBacklink[] }>();
  for (const link of backlinks) {
    const existing = groups.get(link.identity.id);
    if (existing) existing.items.push(link);
    else groups.set(link.identity.id, { ...link.identity, items: [link] });
  }
  return [...groups.values()];
}
