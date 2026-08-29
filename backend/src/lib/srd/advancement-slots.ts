// PHB: ASI/feat slots at levels 4, 8, 12, 16, 19 — edition-invariant (2014/2024 agree).

import type { RulesEdition } from "@character-sheet/shared-types";

import { effectiveEntryLevel } from "@/lib/leveling/effective-levels.js";
import { resolveSubclassSlug, type SubclassIdentityInput, type SubclassSlug } from "@/lib/classes/subclass-slug.js";

const BASE_ASI_LEVELS = [4, 8, 12, 16, 19];

export function advancementSlotsForLevel(extraAsiLevels: readonly number[], level: number): number {
  return [...BASE_ASI_LEVELS, ...extraAsiLevels].filter((l) => level >= l).length;
}

// Champion's Additional Fighting Style second feat slot: SRD 5.2 p.82 (level 7) / PHB'14 p.72 (level 10) (#1148).
function championAdditionalFightingStyleLevel(edition: RulesEdition): number {
  switch (edition) {
    case "EDITION_2024":
      return 7;
    case "EDITION_2014":
      return 10;
    default: {
      const exhaustive: never = edition;
      throw new Error(`championAdditionalFightingStyleLevel: unhandled edition ${String(exhaustive)}`);
    }
  }
}

// SRD 5.2 Fighting Style feat: Fighter at level 1, Paladin/Ranger at level 2; only "fighter-champion" adds the #1148 second slot.
export function fightingStyleFeatSlots(
  fightingStyleFeatLevel: number | null | undefined,
  level: number,
  subclass: SubclassSlug | undefined,
  edition: RulesEdition,
): number {
  const base = fightingStyleFeatLevel != null && level >= fightingStyleFeatLevel ? 1 : 0;
  const championExtra = subclass === "fighter-champion" && level >= championAdditionalFightingStyleLevel(edition) ? 1 : 0;
  return base + championExtra;
}

// class.name is the canonical catalog class name — never CharacterClassEntry's own (free-to-diverge) name column.
interface FightingStyleGatedEntry extends SubclassIdentityInput {
  level: number;
  class: { name: string; fightingStyleFeatLevel: number | null } | null;
}

// characterFightingStyleFeatSlots and fightingStyleGrantingClassNames both route through this — never re-derive the predicate at either call site.
function fightingStyleFeatSlotsForEntry(
  entry: FightingStyleGatedEntry,
  entryCount: number,
  derivedLevel: number,
  edition: RulesEdition,
): number {
  const subclass = entry.class ? resolveSubclassSlug(entry.class.name, entry) : undefined;
  return fightingStyleFeatSlots(
    entry.class?.fightingStyleFeatLevel ?? null,
    effectiveEntryLevel(entry.level, entryCount, derivedLevel),
    subclass,
    edition,
  );
}

// Single shared rule for the takeFeat slot channel, reconcileAdvancements, and serializeCharacter's fightingStyleSlots read — never inline a per-entry copy.
export function characterFightingStyleFeatSlots(
  entries: readonly FightingStyleGatedEntry[],
  derivedLevel: number,
  edition: RulesEdition,
): number {
  return entries.reduce((sum, e) => sum + fightingStyleFeatSlotsForEntry(e, entries.length, derivedLevel, edition), 0);
}

// Same per-entry evaluation as characterFightingStyleFeatSlots (via fightingStyleFeatSlotsForEntry) — never re-derive.
export function fightingStyleGrantingClassNames(
  entries: readonly FightingStyleGatedEntry[],
  derivedLevel: number,
  edition: RulesEdition,
): string[] {
  return entries
    .filter((e) => e.class != null && fightingStyleFeatSlotsForEntry(e, entries.length, derivedLevel, edition) > 0)
    .map((e) => e.class!.name);
}

interface AdvancementGatedEntry {
  level: number;
  class: { extraAsiLevels: readonly number[] } | null;
}

// PHB'24 p.163: ASI/feat slots accrue per class level, not primary-class × total level.
// Single shared rule for the takeAsi/takeFeat slot cap, reconcileAdvancements, applyAdvancementClamp, and the featSlotCap readers — never inline a per-entry copy.
export function characterAdvancementSlots(
  entries: readonly AdvancementGatedEntry[],
  derivedLevel: number,
): number {
  return entries.reduce(
    (sum, e) =>
      sum + advancementSlotsForLevel(e.class?.extraAsiLevels ?? [], effectiveEntryLevel(e.level, entries.length, derivedLevel)),
    0,
  );
}

// PHB'14 p.163: options are AND-ed within an option, OR-ed across options (e.g. Fighter's [{strength:13},{dexterity:13}]).
export type MulticlassPrerequisiteOption = Record<string, number>;

export interface MulticlassPrerequisiteResult {
  met: boolean;
  // Empty when the class carries no prerequisite (homebrew/unknown class).
  description: string;
}

// This builds a backend error string, not UI rendering, so a literal capitalize is safe here.
function capitalizeAbility(ability: string): string {
  return ability.charAt(0).toUpperCase() + ability.slice(1);
}

export function multiclassPrerequisitesMet(
  options: readonly MulticlassPrerequisiteOption[] | null | undefined,
  abilityScores: Record<string, number>,
): MulticlassPrerequisiteResult {
  if (!options || options.length === 0) return { met: true, description: "" };
  const met = options.some((option) =>
    Object.entries(option).every(([ability, min]) => (abilityScores[ability] ?? 0) >= min),
  );
  const description = options
    .map((option) =>
      Object.entries(option)
        .map(([ability, min]) => `${capitalizeAbility(ability)} ${min}`)
        .join(" and "),
    )
    .join(" or ");
  return { met, description };
}
