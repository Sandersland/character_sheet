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
