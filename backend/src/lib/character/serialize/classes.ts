// Clamp-on-read blocks here pair 1:1 with LEVEL_GATED_RECONCILERS (lib/leveling/level-reconciliation.ts).

import {
  advancementSlotsForLevel,
  deriveFeatBonuses,
  deriveFeatProficiencies,
  fightingStyleChoiceCount,
  type FightingStyleKey,
} from "@/lib/srd/srd.js";
import { deriveResources } from "@/lib/classes/class-features.js";
import { deriveActions, type AvailableAction } from "@/lib/classes/actions.js";
import { clampChoicesToCaps, normalizeResourcesMutable, type AdvancementEntry } from "@/lib/classes/resources.js";
import { effectiveEntryLevel, subclassActiveAt } from "@/lib/leveling/effective-levels.js";
import { normalizeHitPoints } from "@/lib/combat/hitpoints.js";
import { reverseAdvancementEffects } from "@/lib/leveling/advancement.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";

export type PrimaryClass = CharacterWithRelations["classEntries"][number] | undefined;

// Resources clamp-on-read: derive class/subclass pools + level-gated caps, then
// layer stored `used` counts and known lists (clamped to caps). Also resolves
// the Fighting Style clamp (null when the character isn't entitled). Returns the
// resources view (undefined for classes with no pools) plus the clamped
// fightingStyle + its choice count, both reused elsewhere in serializeCharacter.
export function buildResourcesView(
  row: CharacterWithRelations,
  primaryClass: PrimaryClass,
  level: number,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
): { resources: object | undefined; fightingStyle: FightingStyleKey | null; fightingStyleChoiceCount: number } {
  const derivedRes = deriveResources(
    primaryClass?.name ?? "",
    primaryClass?.subclass ?? undefined,
    level,
    abilityScores,
    proficiencyBonus,
  );

  // ── Fighting Style clamp-on-read ──────────────────────────────────────────
  // The chosen style key is persisted in resources.fightingStyle. Clamp it to
  // null when the character is no longer entitled (e.g. class change / level
  // drop) — defense-in-depth mirroring reconcileFightingStyle on the write side.
  const fightingStyleChoices = fightingStyleChoiceCount(primaryClass?.name ?? "", level);
  const storedFightingStyle = normalizeResourcesMutable(row.resources).fightingStyle;
  const fightingStyle: FightingStyleKey | null =
    fightingStyleChoices > 0 ? storedFightingStyle : null;

  const resources = derivedRes
    ? buildResourcesPayload(
        derivedRes,
        normalizeResourcesMutable(row.resources),
        fightingStyle,
        fightingStyleChoices,
      )
    : undefined;

  return { resources, fightingStyle, fightingStyleChoiceCount: fightingStyleChoices };
}

// Assemble the wire `resources` payload from the derived caps + stored mutable
// state, clamping each level-gated list to its derived count (defense-in-depth
// for characters who haven't had a reconciling XP op since their level dropped).
// Byte-identical to the former inline construction (feeds the serialize oracle).
function buildResourcesPayload(
  derivedRes: NonNullable<ReturnType<typeof deriveResources>>,
  stored: ReturnType<typeof normalizeResourcesMutable>,
  fightingStyle: FightingStyleKey | null,
  fightingStyleChoiceCount: number,
): object {
  const clampedManeuversKnown =
    derivedRes.maneuverChoiceCount !== undefined
      ? stored.maneuversKnown.slice(0, derivedRes.maneuverChoiceCount)
      : stored.maneuversKnown;
  const clampedToolProfsKnown =
    derivedRes.toolProfChoiceCount !== undefined
      ? stored.toolProficienciesKnown.slice(0, derivedRes.toolProfChoiceCount)
      : stored.toolProficienciesKnown;
  const clampedDisciplinesKnown =
    derivedRes.disciplineChoiceCount !== undefined
      ? stored.disciplinesKnown.slice(0, derivedRes.disciplineChoiceCount)
      : stored.disciplinesKnown;
  // Generic subclass "choose N" clamp-on-read (#899): keep only keys the derived
  // subclassChoices still grant, each capped to its count — defense-in-depth
  // mirroring reconcileSubclassChoices for characters not yet reconciled.
  const subclassChoices = derivedRes.subclassChoices ?? [];
  const choiceCaps = new Map(subclassChoices.map((c) => [c.key, c.count]));
  const { clamped: clampedChoicesKnown } = clampChoicesToCaps(stored.choicesKnown, choiceCaps);
  return {
    features: derivedRes.features,
    maneuverChoiceCount: derivedRes.maneuverChoiceCount,
    maneuverSaveDC: derivedRes.maneuverSaveDC,
    toolProfChoiceCount: derivedRes.toolProfChoiceCount,
    disciplineChoiceCount: derivedRes.disciplineChoiceCount,
    disciplineSaveDC: derivedRes.disciplineSaveDC,
    shadowArtsAvailable: derivedRes.shadowArtsAvailable,
    cloakOfShadowsAvailable: derivedRes.cloakOfShadowsAvailable,
    pools: derivedRes.resources.map((pool) => ({
      key: pool.key,
      label: pool.label,
      total: pool.total,
      die: pool.die,
      recharge: pool.recharge,
      description: pool.description,
      used: Math.min(pool.total, stored.used[pool.key] ?? 0),
      remaining: pool.total - Math.min(pool.total, stored.used[pool.key] ?? 0),
    })),
    maneuversKnown: clampedManeuversKnown,
    disciplinesKnown: clampedDisciplinesKnown,
    toolProficienciesKnown: clampedToolProfsKnown,
    // Generic subclass "choose N" surface (#899): the derived choices (key/label/
    // count/catalogSource) tell the level-up Choose-N step which pickers to render;
    // choicesKnown holds the (clamped) selections.
    subclassChoices,
    choicesKnown: clampedChoicesKnown,
    // Fighting Style choice surface for the frontend picker. Choice count is
    // level-gated (Fighter L1 -> 1); fightingStyle is already clamped to null
    // when the character isn't entitled.
    fightingStyleChoiceCount,
    fightingStyle,
  };
}

// Advancement clamp-on-read: mirrors reconcile-on-write in
// level-reconciliation.ts. When stored advancements exceed the level-derived
// slot count, cap them and reverse the excess to compute effective ability
// scores / HP / initiative for display (without writing). Returns the clamped
// list + slot total + the effective values.
export function applyAdvancementClamp(
  row: CharacterWithRelations,
  primaryClass: PrimaryClass,
  level: number,
  hitPoints: ReturnType<typeof normalizeHitPoints>,
): {
  effectiveScores: Record<string, number>;
  hitPoints: ReturnType<typeof normalizeHitPoints>;
  effectiveInitBonus: number;
  clampedAdvancements: AdvancementEntry[];
  advSlotTotal: number;
} {
  const storedForAdv = normalizeResourcesMutable(row.resources);
  const advSlotTotal = advancementSlotsForLevel(primaryClass?.name ?? "", level);
  let effectiveScores = row.abilityScores as Record<string, number>;
  let effectiveInitBonus = row.initiativeBonus;
  let effectiveHitPoints = hitPoints;
  const clampedAdvancements = storedForAdv.advancements.slice(0, advSlotTotal);

  if (clampedAdvancements.length < storedForAdv.advancements.length) {
    // Some advancements are beyond the cap — reverse the excess ones to compute
    // effective display values (without writing; reconcile-on-write handles that).
    const excess = storedForAdv.advancements.slice(advSlotTotal);
    const reversed = reverseAdvancementEffects(
      effectiveScores,
      effectiveHitPoints,
      effectiveInitBonus,
      excess,
    );
    effectiveScores = reversed.scores;
    effectiveHitPoints = reversed.hitPoints;
    effectiveInitBonus = reversed.initiativeBonus;
  }

  return { effectiveScores, hitPoints: effectiveHitPoints, effectiveInitBonus, clampedAdvancements, advSlotTotal };
}

// Feat improvement modifier layer: sum structured feat improvements over the
// in-cap advancements. Because clampedAdvancements already excludes over-cap
// feats, level-down behavior is automatic — no separate reversal code needed.
// perLevel bonuses (e.g. Tough) scale with hitDiceTotal (applied level).
export function applyFeatLayer(
  clampedAdvancements: AdvancementEntry[],
  hitDiceTotal: number,
  maxHp: number,
): {
  featBonuses: ReturnType<typeof deriveFeatBonuses>;
  effectiveMaxHp: number;
  featProficiencies: ReturnType<typeof deriveFeatProficiencies>;
} {
  const featBonuses = deriveFeatBonuses(clampedAdvancements, hitDiceTotal);
  const effectiveMaxHp = maxHp + featBonuses.maxHp;
  // Proficiency grants from feats (skills + saving throws). Merged with stored
  // proficiencies by the caller using OR — existing proficiency is never removed.
  const featProficiencies = deriveFeatProficiencies(clampedAdvancements);
  return { featBonuses, effectiveMaxHp, featProficiencies };
}

// Class-specific available actions for the turn tracker — derived from
// class/subclass/level + current resource pools. Universal actions are
// rendered client-side from UNIVERSAL_ACTIONS in lib/turnRules.ts;
// only class-specific ones live here to avoid double-rendering.
export function buildAvailableActionsView(
  primaryClass: PrimaryClass,
  level: number,
  resources: object | undefined,
): AvailableAction[] {
  const pools =
    resources && "pools" in resources
      ? (resources as { pools: { key: string; remaining: number }[] }).pools
      : [];
  return deriveActions(
    primaryClass?.name ?? "",
    primaryClass?.subclass ?? undefined,
    level,
    pools,
  );
}

// Structured, multiclass-aware view alongside the flattened class/subclass.
// Clamp-on-read (issue #124): cap the cumulative per-class levels at the
// XP-derived total so a not-yet-reconciled over-cap character still renders
// correctly. Position order = allocation order, so position-0 keeps its levels
// first and trailing (newest) classes absorb the shortfall.
export function buildClassesView(row: CharacterWithRelations, totalLevel: number) {
  let remaining = totalLevel;
  const out: {
    id: string;
    name: string;
    level: number;
    subclass?: string;
    subclassId?: string;
    classId?: string;
  }[] = [];
  for (const entry of row.classEntries) {
    if (remaining <= 0) break;
    const level = Math.min(entry.level, remaining);
    remaining -= level;
    // Per-entry subclass clamp-on-read (issue #125): hide a subclass whose
    // grant level exceeds this entry's effective level. Mirrors reconcileSubclass.
    const effectiveLevel = effectiveEntryLevel(level, row.classEntries.length, totalLevel);
    const subclassVisible = subclassActiveAt(effectiveLevel, entry.class?.subclassLevel);
    out.push({
      id: entry.id,
      name: entry.name,
      level,
      subclass: subclassVisible ? (entry.subclass ?? undefined) : undefined,
      subclassId: subclassVisible ? (entry.subclassId ?? undefined) : undefined,
      classId: entry.classId ?? undefined,
    });
  }
  return out;
}
