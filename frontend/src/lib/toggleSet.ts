// Returns a new Set with `key` toggled — added when absent, removed when
// present. The canonical immutable Set-toggle for multi-select state setters:
// `setSelection((prev) => toggledSet(prev, id))`.
export function toggledSet<T>(set: Set<T>, key: T): Set<T> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
