/**
 * Timeline utilities for ActivityModal (the unified character event timeline,
 * which now also covers inventory history).
 */

/** Human-readable date header — "Today", "Jun 19", or "Jun 19, 2024" when the
 *  date falls in a prior (or future) year, so last year's "Jun 19" isn't
 *  confused with this year's. The year is added only when it differs from the
 *  current year. */
export function formatBatchDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Today";
  const includeYear = date.getFullYear() !== now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  });
}

/** Groups entries by batchId (falling back to id), preserving newest-first
 *  order by first occurrence of each batch key. Works for any entry type
 *  that has `id`, `batchId?`, and `createdAt`. */
export function groupByBatch<T extends { id: string; batchId?: string; createdAt: string }>(
  entries: T[]
): Array<{ key: string; createdAt: string; rows: T[] }> {
  const batches: Array<{ key: string; createdAt: string; rows: T[] }> = [];
  const indexByKey = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.batchId ?? entry.id;
    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      batches[existingIndex].rows.push(entry);
    } else {
      indexByKey.set(key, batches.length);
      batches.push({ key, createdAt: entry.createdAt, rows: [entry] });
    }
  }
  return batches;
}

/** Groups already-ordered items into per-date sections so a single date
 *  header can be rendered per day instead of repeating the date for every
 *  item that shares it. Consecutive items with the same `formatBatchDate`
 *  label fall under one section; newest-first input order is preserved both
 *  across sections and within each section. Works for any item that has a
 *  `createdAt` (e.g. raw events or batches from `groupByBatch`). */
export function groupByDate<T extends { createdAt: string }>(
  items: T[]
): Array<{ label: string; createdAt: string; items: T[] }> {
  const sections: Array<{ label: string; createdAt: string; items: T[] }> = [];
  for (const item of items) {
    const label = formatBatchDate(item.createdAt);
    const current = sections[sections.length - 1];
    if (current && current.label === label) {
      current.items.push(item);
    } else {
      sections.push({ label, createdAt: item.createdAt, items: [item] });
    }
  }
  return sections;
}
