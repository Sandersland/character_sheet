// Attacks made when taking the Attack action, by class + level (PHB Extra
// Attack). Multiclass takes the MAX across classes — Extra Attack never stacks.
export function deriveAttacksPerAction(
  classEntries: ReadonlyArray<{ name: string; level: number; subclass?: string | null }>,
): number {
  return classEntries.reduce(
    (best, e) => Math.max(best, attacksForClass(e.name, e.level, e.subclass)),
    1,
  );
}

function attacksForClass(name: string, level: number, subclass?: string | null): number {
  const cls = name.toLowerCase();
  if (cls === "fighter") {
    if (level >= 20) return 4;
    if (level >= 11) return 3;
    if (level >= 5) return 2;
    return 1;
  }
  if (cls === "barbarian" || cls === "monk" || cls === "paladin" || cls === "ranger") {
    return level >= 5 ? 2 : 1;
  }
  // College of Valor bard gains Extra Attack at bard level 6.
  if (cls === "bard" && level >= 6 && (subclass ?? "").toLowerCase().includes("valor")) {
    return 2;
  }
  return 1;
}
