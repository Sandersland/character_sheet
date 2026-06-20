/**
 * Shared timeline utilities used by both LedgerModal (inventory history) and
 * ActivityModal (unified character event timeline).
 */

/** Human-readable date header — "Today" or "Jun 19". */
export function formatBatchDate(iso: string): string {
  const date = new Date(iso);
  if (date.toDateString() === new Date().toDateString()) return "Today";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
