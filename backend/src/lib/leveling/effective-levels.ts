// Shared level-gating policy leaves — single-sourced so reconcile-on-write and
// clamp-on-read compute the same limit (pure, zero project imports → no cycles).

// Single-class: the XP-derived total is authoritative (the per-class `level`
// column can be stale, self-healed lazily by HP level-up). Multiclass: use each
// entry's own level.
export function effectiveEntryLevel(entryLevel: number, entryCount: number, derivedLevel: number): number {
  return entryCount <= 1 ? derivedLevel : entryLevel;
}

// A subclass's grant gate; defaults to level 3 when the class declares none.
export function subclassGateLevel(subclassLevel: number | null | undefined): number {
  return subclassLevel ?? 3;
}

// Whether a subclass's level-gated grants are active at this effective level.
export function subclassActiveAt(effectiveLevel: number, subclassLevel: number | null | undefined): boolean {
  return effectiveLevel >= subclassGateLevel(subclassLevel);
}
