import type { RulesEdition } from "@character-sheet/shared-types";

import { effectiveEntryLevel } from "@/lib/leveling/effective-levels.js";
import { draconicResilienceMaxHpBonus } from "@/lib/srd/hit-points.js";
import { resolveSubclassSlug } from "./subclass-slug.js";
import { sorcerer } from "./sorcerer.js";

/**
 * The minimal structural class-entry shape the Draconic Bloodline resolvers
 * need. Every field is REQUIRED on purpose: `subclass`/`subclassRef` feed
 * resolveSubclassSlug and `class.subclassLevel` feeds the 2014 gate, so an
 * optional field would let a narrow Prisma select compile and then silently
 * resolve "not Draconic" / the wrong gate — the select and this computation
 * must travel together. A new call site widens its select or fails typecheck.
 */
export interface DraconicSorcererEntry {
  name: string;
  level: number;
  subclass: string | null;
  subclassRef: { slug: string } | null;
  class: { subclassLevel: number } | null;
}

/**
 * The character's Draconic Bloodline sorcerer class entry, or `undefined` if
 * it doesn't have one — the ONE slug-gated resolution shared by
 * draconicResilienceOverride (the #1122 AC override),
 * draconicResilienceMaxHpTerm below, and draconicWingsFlySpeed (#1123).
 * Extracted so a slug typo or a diverging name-lookup in one caller can't
 * silently disagree with the others — previously copy-pasted three times.
 */
export function draconicBloodlineEntry<T extends DraconicSorcererEntry>(
  classEntries: readonly T[],
): T | undefined {
  const sorcererEntry = classEntries.find((e) => e.name.toLowerCase() === "sorcerer");
  if (!sorcererEntry) return undefined;
  return resolveSubclassSlug("sorcerer", sorcererEntry) === "sorcerer-draconic-bloodline" ? sorcererEntry : undefined;
}

/**
 * The Draconic entry plus its effective sorcerer level (#1070 convention:
 * entry-scoped for multiclass, XP-derived for single-class via
 * effectiveEntryLevel — the raw `level` column lags a pending level-up
 * ceremony). The ONE level resolution shared by the max-HP term below and
 * draconicWingsFlySpeed, so the two halves of the subclass can never
 * disagree about what level the sorcerer is.
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
 * Draconic Resilience's max-HP term (#1123), 0 for any non-Draconic character.
 * The ONE function every HP-max composition resolves the subclass term
 * through — applyFeatLayer (serializeCharacter's clamp-on-read),
 * effectiveMaxHitPointsForRow (the write seam: heal cap, long rest,
 * level-up), and every inline write-side clamp (reconcileAdvancements,
 * resolveSetExhaustion, computeLevelDownState, applyAdvancementOpInTx,
 * applyAddClass). CLAUDE.md's reconciler/clamp-on-read rule: all of them
 * MUST call this, never an inline copy of the formula.
 */
export function draconicResilienceMaxHpTerm(
  classEntries: readonly DraconicSorcererEntry[],
  derivedTotalLevel: number,
  edition: RulesEdition,
): number {
  const resolved = draconicBloodlineLevel(classEntries, derivedTotalLevel);
  if (!resolved) return 0;
  // Null-FK guard: `class` is null when classId is (SetNull on catalog
  // deletion/retag, or a free-text class). subclassGateLevel's own fallback is
  // 3 — wrong for Sorcerer, whose PHB'14 p.99 Sorcerous Origin gate is 1 — so
  // fall back to the sorcerer module's grantLevel instead, mirroring
  // isSubclassActive's `seededSubclassLevel ?? def.grantLevel` (registry.ts).
  const subclassGate = resolved.entry.class?.subclassLevel ?? sorcerer.subclasses?.["draconic bloodline"]?.grantLevel;
  return draconicResilienceMaxHpBonus(resolved.level, subclassGate, edition);
}
