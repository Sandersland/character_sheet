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
