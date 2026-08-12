// Per 5e PHB: most classes get ASI slots at levels 4, 8, 12, 16, 19 — the
// edition-invariant base schedule, which stays code (CLAUDE.md: ASI levels are
// one of the rules where 2014/2024 agree). Per-class content — Fighter's two
// extras (6/14), Rogue's one (10), the Fighting Style feat grant level, and the
// multiclass ability prerequisite — moved onto CharacterClass columns (#1529);
// these functions now read that content as parameters instead of looking it up
// by class name in a Record. `classId: null` (homebrew) resolves to `[]`/`null`
// at the caller (`entry.class?.… ?? …`), which is the base schedule / never
// granted / no prerequisite — by FK, not by name (fixes #1388's class half).

import type { RulesEdition } from "@character-sheet/shared-types";

import { effectiveEntryLevel } from "@/lib/leveling/effective-levels.js";
import { resolveSubclassSlug, type SubclassIdentityInput, type SubclassSlug } from "@/lib/classes/subclass-slug.js";

const BASE_ASI_LEVELS = [4, 8, 12, 16, 19];

/**
 * Returns the cumulative number of Ability Score Improvement / Feat slots
 * earned at `level`, given the class's own extra-ASI levels (`[]` for a class
 * with none, or for homebrew — CharacterClass.extraAsiLevels).
 */
export function advancementSlotsForLevel(extraAsiLevels: readonly number[], level: number): number {
  return [...BASE_ASI_LEVELS, ...extraAsiLevels].filter((l) => level >= l).length;
}

// SRD 5.2 p.82 / PHB'14 p.72: the Champion's Additional Fighting Style grants a
// SECOND Fighting Style feat slot — level 7 in 2024 (Remarkable Athlete moved
// to 3, Heroic Warrior lands at 10) vs level 10 in 2014 (Remarkable Athlete is
// at 7) — the grant level forks by edition even though the feature exists in
// both (#1148, re-derived from both PHB tables in the issue thread). One
// function, `edition` last, `switch` + `assertNever` default — the
// subclassGateLevel pattern (#1499/#1527).
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

// SRD 5.2: the Fighting Style feature grants a Fighting Style feat — Fighter at
// level 1, Paladin and Ranger at level 2 (CharacterClass.fightingStyleFeatLevel,
// #1529); `null` means the class never grants one. `subclass` is the resolved
// SUBCLASS_SLUGS identity (resolveSubclassSlug, #1277) — a raw display-name
// string is never accepted here — and only "fighter-champion" adds the #1148
// second slot; every other subclass (including `undefined`, homebrew, or an
// off-slug fighter subclass) leaves the base grant untouched.
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

// The minimal per-entry shape the Fighting Style feat-slot/grant-name
// functions need — `subclass`/`subclassRef` feed resolveSubclassSlug
// (Champion's Additional Fighting Style, #1148), `class.name` is the
// CANONICAL catalog class name (#1495 — never CharacterClassEntry's own
// `name` column, a free-to-diverge display name), and `class` is `null`/its
// fields are absent when the entry is homebrew (CharacterClassEntry.classId
// is nullable by design, #1529).
interface FightingStyleGatedEntry extends SubclassIdentityInput {
  level: number;
  class: { name: string; fightingStyleFeatLevel: number | null } | null;
}

// The ONE per-entry Fighting Style feat-slot evaluation — resolves the
// entry's subclass identity and its class's grant level, both at the entry's
// own effective level (#1065: a Wizard4/Fighter1 multiclass IS entitled via
// the Fighter entry). characterFightingStyleFeatSlots (sum) and
// fightingStyleGrantingClassNames (filter > 0) below BOTH route through this
// — a #1495 review finding: the predicate used to be copy-pasted between the
// two call sites, which is exactly the two-inline-copies drift CLAUDE.md's
// level-gated-state rule exists to prevent (and here it's a #1148
// side-effect: adding the subclass/edition fork gave the duplication a real
// chance to disagree).
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

// Total Fighting Style feat entitlement across every class entry. The single
// shared rule for the takeFeat slot channel, reconcileAdvancements' fs
// partition, and the serializeCharacter fightingStyleSlots read — never
// inline a per-entry copy at those sites.
export function characterFightingStyleFeatSlots(
  entries: readonly FightingStyleGatedEntry[],
  derivedLevel: number,
  edition: RulesEdition,
): number {
  return entries.reduce((sum, e) => sum + fightingStyleFeatSlotsForEntry(e, entries.length, derivedLevel, edition), 0);
}

// The class NAMES that have actually earned the Fighting Style feature at
// `derivedLevel` (#1495) — the offered-style union's input
// (fightingStyleFeatOfferedForClasses, lib/srd/feats.ts). Same per-entry
// evaluation as characterFightingStyleFeatSlots above (fightingStyleFeatSlotsForEntry)
// — never re-derive it at a call site — but returns the granting class NAMES
// instead of a slot count.
export function fightingStyleGrantingClassNames(
  entries: readonly FightingStyleGatedEntry[],
  derivedLevel: number,
  edition: RulesEdition,
): string[] {
  return entries
    .filter((e) => e.class != null && fightingStyleFeatSlotsForEntry(e, entries.length, derivedLevel, edition) > 0)
    .map((e) => e.class!.name);
}

// The minimal per-entry shape characterAdvancementSlots needs.
interface AdvancementGatedEntry {
  level: number;
  class: { extraAsiLevels: readonly number[] } | null;
}

// PHB'24 p.163: ASI/feat slots accrue per CLASS level, not primary-class ×
// total level — a Wizard 3 / Fighter 8 earns the Fighter 4/6/8 slots, not the
// Wizard schedule at total level 11 (#1073). Same shape as
// characterFightingStyleFeatSlots: sum each entry's entitlement at its own
// effective level. The single shared rule for the takeAsi/takeFeat slot cap,
// reconcileAdvancements, applyAdvancementClamp, and the three featSlotCap
// readers — never inline a per-entry copy at those sites.
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

// 5e multiclass ability prerequisite (PHB'14 p. 163): each class's options are AND
// -ed within an option and OR-ed across options — e.g. Fighter's
// `[{strength:13},{dexterity:13}]` (the only OR class), stored verbatim in
// CharacterClass.multiclassPrerequisites (#1529). `null`/`undefined`/`[]`
// (homebrew, no catalog row) carries no prerequisite and is always met.
export type MulticlassPrerequisiteOption = Record<string, number>;

export interface MulticlassPrerequisiteResult {
  met: boolean;
  // Human-readable requirement, e.g. "Strength 13 or Dexterity 13". Empty for a
  // homebrew/unknown class, which carries no prerequisite (always met).
  description: string;
}

// Abilities are always single lowercase words here, so a literal capitalize is
// safe (this is a backend error-message string, not UI key rendering).
function capitalizeAbility(ability: string): string {
  return ability.charAt(0).toUpperCase() + ability.slice(1);
}

/**
 * Whether `abilityScores` satisfy the 5e multiclass ability prerequisite
 * described by `options` (CharacterClass.multiclassPrerequisites, or
 * null/undefined for a homebrew class with no catalog row — always met).
 */
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
