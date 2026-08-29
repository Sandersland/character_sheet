import type { RulesEdition } from "@character-sheet/shared-types";

import { effectiveEntryLevel } from "@/lib/leveling/effective-levels.js";
import { draconicResilienceMaxHpBonus } from "@/lib/srd/hit-points.js";
import { resolveSubclassSlug } from "./subclass-slug.js";

// Every field is REQUIRED on purpose: an optional field would let a narrow Prisma select compile and silently resolve "not Draconic" or the wrong gate.
export interface DraconicSorcererEntry {
  name: string;
  level: number;
  subclass: string | null;
  subclassRef: { slug: string } | null;
  class: { subclassLevel: number } | null;
}

// Shared slug-gated resolution used by draconicResilienceOverride, draconicResilienceMaxHpTerm, and draconicWingsFlySpeed.
export function draconicBloodlineEntry<T extends DraconicSorcererEntry>(
  classEntries: readonly T[],
): T | undefined {
  const sorcererEntry = classEntries.find((e) => e.name.toLowerCase() === "sorcerer");
  if (!sorcererEntry) return undefined;
  return resolveSubclassSlug("sorcerer", sorcererEntry) === "sorcerer-draconic-bloodline" ? sorcererEntry : undefined;
}

// Uses effectiveEntryLevel — the raw `level` column lags a pending level-up ceremony.
export function draconicBloodlineLevel<T extends DraconicSorcererEntry>(
  classEntries: readonly T[],
  derivedTotalLevel: number,
): { entry: T; level: number } | undefined {
  const entry = draconicBloodlineEntry(classEntries);
  if (!entry) return undefined;
  return { entry, level: effectiveEntryLevel(entry.level, classEntries.length, derivedTotalLevel) };
}

// Every HP-max composition (serializeCharacter's clamp-on-read, effectiveMaxHitPointsForRow, every write-side clamp) must resolve this term through this function — never an inline copy.
export function draconicResilienceMaxHpTerm(
  classEntries: readonly DraconicSorcererEntry[],
  derivedTotalLevel: number,
  edition: RulesEdition,
): number {
  const resolved = draconicBloodlineLevel(classEntries, derivedTotalLevel);
  if (!resolved) return 0;
  // `class` is null only for a degraded character (SetNull on catalog deletion/retag, or a free-text class) — subclassGateLevel's ?? 3 default then matches isSubclassActive's own answer.
  return draconicResilienceMaxHpBonus(resolved.level, resolved.entry.class?.subclassLevel, edition);
}
