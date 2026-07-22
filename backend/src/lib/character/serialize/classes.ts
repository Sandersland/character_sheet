// Clamp-on-read blocks here pair 1:1 with LEVEL_GATED_RECONCILERS (lib/leveling/level-reconciliation.ts).

import {
  characterAdvancementSlots,
  characterFightingStyleFeatSlots,
  deriveFeatBonuses,
  deriveFeatProficiencies,
} from "@/lib/srd/srd.js";
import { deriveEntryScopedResources, type DerivedClassInfo } from "@/lib/classes/class-features.js";
import { deriveActions, type AvailableAction } from "@/lib/classes/actions.js";
import { clampChoicesToCaps, normalizeResourcesMutable, splitAdvancementsBySlotCap, type AdvancementEntry } from "@/lib/classes/resources.js";
import { effectiveEntryLevel, subclassActiveAt } from "@/lib/leveling/effective-levels.js";
import { normalizeHitPoints } from "@/lib/combat/hitpoints.js";
import { reverseAdvancementEffects } from "@/lib/leveling/advancement.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";

export type PrimaryClass = CharacterWithRelations["classEntries"][number] | undefined;

// Resources clamp-on-read: derive class/subclass pools + level-gated caps, then
// layer stored `used` counts and known lists (clamped to caps). Returns the
// resources view (undefined for classes with no pools). Fighting Style is a feat
// now (#1137) — surfaced via top-level fightingStyleSlots + advancements, not here.
// The choice-cap fields are entry-scoped (#1177) via deriveEntryScopedResources —
// mirrors loadResourcesReconcileState (level-reconciliation.ts) so both sides
// compute the legal limit through the one shared rule function.
export function buildResourcesView(
  row: CharacterWithRelations,
  level: number,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
): { resources: object | undefined } {
  const { derived: derivedRes } = deriveEntryScopedResources(row.classEntries, level, abilityScores, proficiencyBonus);

  const resources = derivedRes
    ? buildResourcesPayload(derivedRes, normalizeResourcesMutable(row.resources))
    : undefined;

  return { resources };
}

// Assemble the wire `resources` payload from the derived caps + stored mutable
// state, clamping each level-gated list to its derived count (defense-in-depth
// for characters who haven't had a reconciling XP op since their level dropped).
function buildResourcesPayload(
  derivedRes: DerivedClassInfo,
  stored: ReturnType<typeof normalizeResourcesMutable>,
): object {
  const clampedManeuversKnown =
    derivedRes.maneuverChoiceCount !== undefined
      ? stored.maneuversKnown.slice(0, derivedRes.maneuverChoiceCount)
      : stored.maneuversKnown;
  const clampedToolProfsKnown =
    derivedRes.toolProfChoiceCount !== undefined
      ? stored.toolProficienciesKnown.slice(0, derivedRes.toolProfChoiceCount)
      : stored.toolProficienciesKnown;
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
    elementalAttunementAvailable: derivedRes.elementalAttunementAvailable,
    elementalBurstAvailable: derivedRes.elementalBurstAvailable,
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
    toolProficienciesKnown: clampedToolProfsKnown,
    // Generic subclass "choose N" surface (#899): the derived choices (key/label/
    // count/catalogSource) tell the level-up Choose-N step which pickers to render;
    // choicesKnown holds the (clamped) selections.
    subclassChoices,
    choicesKnown: clampedChoicesKnown,
  };
}

// Advancement clamp-on-read: mirrors reconcile-on-write in
// level-reconciliation.ts. When stored advancements exceed the level-derived
// slot count, cap them and reverse the excess to compute effective ability
// scores / HP / initiative for display (without writing). Returns the clamped
// list + slot total + the effective values.
export function applyAdvancementClamp(
  row: CharacterWithRelations,
  level: number,
  hitPoints: ReturnType<typeof normalizeHitPoints>,
): {
  effectiveScores: Record<string, number>;
  hitPoints: ReturnType<typeof normalizeHitPoints>;
  effectiveInitBonus: number;
  clampedAdvancements: AdvancementEntry[];
  advSlotTotal: number;
  usedSlots: number;
  fightingStyleSlotTotal: number;
  usedFightingStyleSlots: number;
} {
  const storedForAdv = normalizeResourcesMutable(row.resources);
  const advSlotTotal = characterAdvancementSlots(row.classEntries, level);
  // Fighting Style feat cap across all class entries (#1137) — its own partition.
  const fightingStyleSlotTotal = characterFightingStyleFeatSlots(row.classEntries, level);
  let effectiveScores = row.abilityScores as Record<string, number>;
  let effectiveInitBonus = row.initiativeBonus;
  let effectiveHitPoints = hitPoints;
  // Origin feats are kept regardless of the slot cap (#1130); fs feats trim against
  // their own cap (#1137) — both handled by the shared split.
  const { kept: clampedAdvancements, excess, usedSlots, usedFightingStyleSlots } = splitAdvancementsBySlotCap(
    storedForAdv.advancements,
    advSlotTotal,
    fightingStyleSlotTotal,
  );

  if (excess.length > 0) {
    // Some advancements are beyond the cap — reverse the excess ones to compute
    // effective display values (without writing; reconcile-on-write handles that).
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

  return { effectiveScores, hitPoints: effectiveHitPoints, effectiveInitBonus, clampedAdvancements, advSlotTotal, usedSlots, fightingStyleSlotTotal, usedFightingStyleSlots };
}

// Feat improvement modifier layer: sum structured feat improvements over the
// kept advancements (origin feats + slot-bounded entries). Because
// clampedAdvancements already excludes over-cap feats, level-down behavior is
// automatic — no separate reversal code needed.
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
// rendered client-side from UNIVERSAL_ACTIONS;
// only class-specific ones live here to avoid double-rendering.
export function buildAvailableActionsView(
  primaryClass: PrimaryClass,
  level: number,
  resources: object | undefined,
  // Martial Arts blanket condition (bestArmor == null && !hasShield, #1218) —
  // gates the Monk's Bonus Unarmed Strike (requiresUnarmored in DERIVED_ACTIONS).
  unarmoredUnshielded: boolean,
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
    unarmoredUnshielded,
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
