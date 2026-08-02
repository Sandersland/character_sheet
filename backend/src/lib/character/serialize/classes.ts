// Clamp-on-read blocks here pair 1:1 with LEVEL_GATED_RECONCILERS (lib/leveling/level-reconciliation.ts).

import type { RulesEdition } from "@character-sheet/shared-types";

import {
  characterAdvancementSlots,
  characterFightingStyleFeatSlots,
  deriveFeatBonuses,
  deriveFeatProficiencies,
} from "@/lib/srd/srd.js";
import { deriveEntryScopedResources, type DerivedClassInfo } from "@/lib/classes/class-features.js";
import { featureRowsOf } from "@/lib/classes/feature-rows-select.js";
import type { DerivedFeature } from "@/lib/classes/types.js";
import { deriveEntryScopedActions, type AvailableAction } from "@/lib/classes/actions.js";
import { deriveManeuverEffect } from "@/lib/classes/maneuver-effect.js";
import { clampChoicesToCaps, normalizeResourcesMutable, splitAdvancementsBySlotCap, type AdvancementEntry } from "@/lib/classes/resources.js";
import { effectiveEntryLevel, subclassActiveAt } from "@/lib/leveling/effective-levels.js";
import { editionOf } from "@/lib/rules/edition.js";
import { normalizeHitPoints } from "@/lib/combat/hitpoints.js";
import { reverseAdvancementEffects } from "@/lib/leveling/advancement.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";

export type PrimaryClass = CharacterWithRelations["classEntries"][number] | undefined;

// Resources clamp-on-read: derive class/subclass pools + level-gated caps, then
// layer stored `used` counts and known lists (clamped to caps). Returns the
// resources view (undefined for classes with no pools) plus the raw
// maneuverSaveDC number — serializeCharacter folds it into the top-level
// `maneuvers` rider (#1316), so it isn't part of the resources payload.
// Fighting Style is a feat now (#1137) — surfaced via top-level
// fightingStyleSlots + advancements, not here. The choice-cap fields are
// entry-scoped (#1177) via deriveEntryScopedResources — mirrors
// loadResourcesReconcileState (level-reconciliation.ts) so both sides compute
// the legal limit through the one shared rule function.
export function buildResourcesView(
  row: CharacterWithRelations,
  level: number,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
): { resources: object | undefined; maneuverSaveDC: number | undefined } {
  // The ONE production caller that supplies real ClassFeature rows (#1524):
  // characterInclude loaded entry.class.features (already subclassId:null
  // filtered) and entry.subclassRef.features — featuresFromRows/poolsFromRows
  // do the per-edition filter inside deriveResources itself. featureRowsOf
  // (feature-rows-select.ts, #1528 chunk 0) is the SAME extractor every
  // narrow-select caller now uses too, so this stays the one place the
  // "class"/"subclassRef" → carrier mapping is written.
  const { derived: derivedRes } = deriveEntryScopedResources(
    row.classEntries,
    level,
    abilityScores,
    proficiencyBonus,
    editionOf(row),
    featureRowsOf,
  );

  const resources = derivedRes
    ? buildResourcesPayload(derivedRes, normalizeResourcesMutable(row.resources))
    : undefined;

  return { resources, maneuverSaveDC: derivedRes?.maneuverSaveDC };
}

// #1272/#1374: DerivedFeature.edition is a server-side selector (which of a
// fork's two rows survived featuresFromRows' edition filter,
// lib/classes/class-feature-rows.ts, #1524) — never a client-trusted rule
// input, so it must not cross the wire. Every other buildResourcesPayload
// field is already explicitly projected; `features` was the one passthrough.
export function toWireFeatures(
  features: DerivedFeature[],
): { name: string; level: number; description: string; source: "class" | "subclass" }[] {
  return features.map(({ name, level, description, source }) => ({ name, level, description, source }));
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
  // #1381: resolved once per response (not per maneuver) — the die is uniform
  // across every known maneuver, keyed off the character's OWN superiority
  // die (deriveManeuverEffect), not a per-maneuver catalog column.
  const maneuverEffect = derivedRes.maneuverChoiceCount !== undefined ? deriveManeuverEffect(derivedRes) : undefined;
  return {
    features: toWireFeatures(derivedRes.features),
    maneuverChoiceCount: derivedRes.maneuverChoiceCount,
    toolProfChoiceCount: derivedRes.toolProfChoiceCount,
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
    maneuversKnown: maneuverEffect
      ? clampedManeuversKnown.map((m) => ({ ...m, effect: maneuverEffect }))
      : clampedManeuversKnown,
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

// Class-specific available actions for the turn tracker — derived from EVERY
// class entry at its own effective level (#1206/#1315), not just the primary
// entry at total level, so a secondary class's gated actions (e.g. a Warrior
// of Shadow monk's shadowArts/cloakOfShadows) surface even when it isn't
// primary. Universal actions are served per edition by referenceRouter (#1430);
// only class-specific ones live here to avoid double-rendering.
export function buildAvailableActionsView(
  classEntries: CharacterWithRelations["classEntries"],
  level: number,
  resources: object | undefined,
  // Martial Arts blanket condition (bestArmor == null && !hasShield, #1218) —
  // gates the Monk's Bonus Unarmed Strike (requiresUnarmored in DERIVED_ACTIONS).
  unarmoredUnshielded: boolean,
  edition: RulesEdition,
): AvailableAction[] {
  const pools =
    resources && "pools" in resources
      ? (resources as { pools: { key: string; remaining: number }[] }).pools
      : [];
  // featureRowsOf (#1528 chunk 0): a Fighter entry's row-driven actions
  // (Second Wind/Action Surge) surface here through the SAME carrier
  // buildResourcesView passes for its pools/features.
  return deriveEntryScopedActions(classEntries, level, pools, unarmoredUnshielded, edition, featureRowsOf);
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
    needsSubclass: boolean;
    subclassUnavailable: boolean;
  }[] = [];
  const edition = editionOf(row);
  for (const entry of row.classEntries) {
    if (remaining <= 0) break;
    const level = Math.min(entry.level, remaining);
    remaining -= level;
    // Per-entry subclass clamp-on-read (issue #125): hide a subclass whose
    // grant level exceeds this entry's effective level. Mirrors reconcileSubclass.
    const effectiveLevel = effectiveEntryLevel(level, row.classEntries.length, totalLevel);
    const subclassVisible = subclassActiveAt(effectiveLevel, entry.class?.subclassLevel, edition);
    // Stranded-subclass determination (#1598): a held row edition-tagged for a
    // DIFFERENT edition than the character's own. This can only arise from a
    // catalog retag landing AFTER the pick — crossEditionRejection
    // (applySetSubclass) already blocks the pick itself at creation/level-up/
    // setSubclass — so it is a legacy-state check, not a rule the write path
    // also needs. featuresFromRows filters subclass features by the
    // CHARACTER's edition (class-feature-rows.ts), so a stranded entry derives
    // zero subclass features while `subclass` above still renders the name;
    // the frontend uses this flag to explain that split rather than hide it.
    const subclassRowEdition = entry.subclassRef?.edition ?? null;
    const subclassUnavailable = Boolean(entry.subclassId) && subclassRowEdition !== null && subclassRowEdition !== edition;
    out.push({
      id: entry.id,
      name: entry.name,
      level,
      subclass: subclassVisible ? (entry.subclass ?? undefined) : undefined,
      subclassId: subclassVisible ? (entry.subclassId ?? undefined) : undefined,
      classId: entry.classId ?? undefined,
      // Gate passed AND (nothing picked yet OR the pick is stranded) — the
      // frontend reads this instead of re-deriving level >= subclassGateLevel
      // (CLAUDE.md: rules logic is backend-owned). Per-entry, unlike the old
      // frontend mirror that compared TOTAL character level against the
      // PRIMARY entry's subclass (wrong for multiclass).
      needsSubclass: subclassVisible && (!entry.subclassId || subclassUnavailable),
      subclassUnavailable,
    });
  }
  return out;
}
