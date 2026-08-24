import type { RulesEdition } from "@character-sheet/shared-types";

import { effectiveEntryLevel } from "@/lib/leveling/effective-levels.js";
import { draconicResilienceMaxHpBonus } from "@/lib/srd/hit-points.js";
import { resolveSubclassSlug } from "./subclass-slug.js";

/**
 * Every field is REQUIRED on purpose: an optional field would let a narrow
 * Prisma select compile and then silently resolve "not Draconic" or the wrong
 * gate — a new call site widens its select or fails typecheck.
 */
export interface DraconicSorcererEntry {
  name: string;
  level: number;
  subclass: string | null;
  subclassRef: { slug: string } | null;
  class: { subclassLevel: number } | null;
}

/**
 * The character's Draconic Bloodline sorcerer entry, or undefined — the one
 * slug-gated resolution shared by draconicResilienceOverride,
 * draconicResilienceMaxHpTerm, and draconicWingsFlySpeed.
 */
export function draconicBloodlineEntry<T extends DraconicSorcererEntry>(
  classEntries: readonly T[],
): T | undefined {
  const sorcererEntry = classEntries.find((e) => e.name.toLowerCase() === "sorcerer");
  if (!sorcererEntry) return undefined;
  return resolveSubclassSlug("sorcerer", sorcererEntry) === "sorcerer-draconic-bloodline" ? sorcererEntry : undefined;
}

/**
 * The Draconic entry plus its effective sorcerer level via effectiveEntryLevel
 * (the raw `level` column lags a pending level-up ceremony).
 */
export function draconicBloodlineLevel<T extends DraconicSorcererEntry>(
  classEntries: readonly T[],
  derivedTotalLevel: number,
): { entry: T; level: number } | undefined {
  const entry = draconicBloodlineEntry(classEntries);
  if (!entry) return undefined;
  return { entry, level: effectiveEntryLevel(entry.level, classEntries.length, derivedTotalLevel) };
}

/**
 * Draconic Resilience's max-HP term, 0 for any non-Draconic character. Every
 * HP-max composition — serializeCharacter's clamp-on-read, the write seam
 * (effectiveMaxHitPointsForRow), and every write-side clamp — must resolve the
 * term through this function, never an inline copy of the formula.
 */
export function draconicResilienceMaxHpTerm(
  classEntries: readonly DraconicSorcererEntry[],
  derivedTotalLevel: number,
  edition: RulesEdition,
): number {
  const resolved = draconicBloodlineLevel(classEntries, derivedTotalLevel);
  if (!resolved) return 0;
  // The seeded CharacterClass.subclassLevel is the sole PHB'14 gate source.
  // `class` is null only when classId is (SetNull on catalog deletion/retag,
  // or a free-text class) — that degraded character gates at subclassGateLevel's
  // plain ?? 3 default, the same answer isSubclassActive resolves for it.
  return draconicResilienceMaxHpBonus(resolved.level, resolved.entry.class?.subclassLevel, edition);
}
