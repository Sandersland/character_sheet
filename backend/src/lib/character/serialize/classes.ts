// Clamp-on-read blocks here pair 1:1 with LEVEL_GATED_RECONCILERS.

import type { RulesEdition } from "@character-sheet/shared-types";

import {
  abilityModifier,
  bothWeaponsLight,
  characterAdvancementSlots,
  characterFightingStyleFeatSlots,
  fightingStyleGrantingClassNames,
  deriveImprovementBonuses,
  deriveImprovementProficiencies,
} from "@/lib/srd/srd.js";
import { deriveEntryScopedResources, type DerivedClassInfo } from "@/lib/classes/class-features.js";
import { featureRowsOf } from "@/lib/classes/feature-rows-select.js";
import { draconicResilienceMaxHpTerm } from "@/lib/classes/draconic-bloodline.js";
import type { DerivedFeature } from "@/lib/classes/types.js";
import type { FeatImprovement } from "@/lib/classes/resources-state.js";
import { deriveEntryScopedActions, type AvailableAction } from "@/lib/classes/actions.js";
import { deriveManeuverEffect } from "@/lib/classes/maneuver-effect.js";
import { clampChoicesToCaps, normalizeResourcesMutable, splitAdvancementsBySlotCap, type AdvancementEntry } from "@/lib/classes/resources.js";
import { effectiveEntryLevel, subclassActiveAt } from "@/lib/leveling/effective-levels.js";
import { editionOf } from "@/lib/rules/edition.js";
import { effectiveMaxHitPoints, normalizeHitPoints } from "@/lib/combat/hitpoints.js";
import { reverseAdvancementEffects } from "@/lib/leveling/advancement.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";

export type PrimaryClass = CharacterWithRelations["classEntries"][number] | undefined;

// Mirrors loadResourcesReconcileState so both sides compute the legal limit through the one shared rule function.
// announcedSaveDC is returned separately — serializeCharacter folds it into the top-level maneuvers rider (#1316), not the resources payload.
export function buildResourcesView(
  row: CharacterWithRelations,
  level: number,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
): {
  resources: ReturnType<typeof buildResourcesPayload> | undefined;
  announcedSaveDC: number | undefined;
  classFeatureImprovements: FeatImprovement[];
} {
  // featureRowsOf is the same extractor every narrow-select caller uses — the one place the class/subclassRef → carrier mapping is written.
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

  return { resources, announcedSaveDC: derivedRes?.announcedSaveDC, classFeatureImprovements: derivedRes?.improvements ?? [] };
}

// DerivedFeature.edition is a server-side selector (which of a fork's two rows survived featuresFromRows' edition filter) — never a client-trusted rule input, so it must not cross the wire (#1272/#1374).
export function toWireFeatures(
  features: DerivedFeature[],
): { name: string; level: number; description: string; source: "class" | "subclass" }[] {
  return features.map(({ name, level, description, source }) => ({ name, level, description, source }));
}

// Defense-in-depth clamp for characters without a reconciling XP op since their level dropped.
// No explicit return type (#1588): inferring the literal shape lets ReturnType<typeof buildResourcesPayload> carry every field precisely, instead of a widened object forcing guards + casts on readers.
function buildResourcesPayload(
  derivedRes: DerivedClassInfo,
  stored: ReturnType<typeof normalizeResourcesMutable>,
) {
  const clampedManeuversKnown =
    derivedRes.maneuverChoiceCount !== undefined
      ? stored.maneuversKnown.slice(0, derivedRes.maneuverChoiceCount)
      : stored.maneuversKnown;
  const clampedToolProfsKnown =
    derivedRes.toolProfChoiceCount !== undefined
      ? stored.toolProficienciesKnown.slice(0, derivedRes.toolProfChoiceCount)
      : stored.toolProficienciesKnown;
  // Deliberately NOT the permissive slice-or-full shape above: undefined expertiseChoiceCount clamps to ZERO, matching applyLearnExpertiseOp's and reconcileExpertise's own undefined→0 treatment so learn/clamp/reconcile all agree (#1588).
  const clampedExpertiseKnown = stored.expertiseKnown.slice(0, derivedRes.expertiseChoiceCount ?? 0);
  // Mirrors reconcileSubclassChoices (#899).
  const subclassChoices = derivedRes.subclassChoices ?? [];
  const choiceCaps = new Map(subclassChoices.map((c) => [c.key, c.count]));
  const { clamped: clampedChoicesKnown } = clampChoicesToCaps(stored.choicesKnown, choiceCaps);
  // The die is uniform across every known maneuver, keyed off the character's own superiority die, not a per-maneuver catalog column (#1381).
  const maneuverEffect = derivedRes.maneuverChoiceCount !== undefined ? deriveManeuverEffect(derivedRes) : undefined;
  return {
    features: toWireFeatures(derivedRes.features),
    maneuverChoiceCount: derivedRes.maneuverChoiceCount,
    toolProfChoiceCount: derivedRes.toolProfChoiceCount,
    expertiseChoiceCount: derivedRes.expertiseChoiceCount,
    pools: derivedRes.resources.map((pool) => ({
      key: pool.key,
      label: pool.label,
      total: pool.total,
      die: pool.die,
      recharge: pool.recharge,
      description: pool.description,
      details: pool.details,
      used: Math.min(pool.total, stored.used[pool.key] ?? 0),
      remaining: pool.total - Math.min(pool.total, stored.used[pool.key] ?? 0),
    })),
    maneuversKnown: maneuverEffect
      ? clampedManeuversKnown.map((m) => ({ ...m, effect: maneuverEffect }))
      : clampedManeuversKnown,
    toolProficienciesKnown: clampedToolProfsKnown,
    expertiseKnown: clampedExpertiseKnown,
    subclassChoices,
    choicesKnown: clampedChoicesKnown,
  };
}

// Mirrors reconcileAdvancements: caps stored advancements exceeding the level-derived slot count and reverses the excess for display, without writing.
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
  fightingStyleGrantingClasses: string[];
} {
  const storedForAdv = normalizeResourcesMutable(row.resources);
  const advSlotTotal = characterAdvancementSlots(row.classEntries, level);
  const edition = editionOf(row);
  // Fighting Style feat cap is its own partition (#1137); edition matters — Champion's Additional Fighting Style second slot forks at level 7 (2024) vs 10 (2014) (#1148).
  const fightingStyleSlotTotal = characterFightingStyleFeatSlots(row.classEntries, level, edition);
  // Served so the frontend never re-derives the level threshold client-side (#1495); resolveCatalogFeat's gate reads the same shared rule.
  const fightingStyleGrantingClasses = fightingStyleGrantingClassNames(row.classEntries, level, edition);
  let effectiveScores = row.abilityScores as Record<string, number>;
  let effectiveInitBonus = row.initiativeBonus;
  let effectiveHitPoints = hitPoints;
  // Origin feats are kept regardless of the slot cap (#1130); fighting-style feats trim against their own cap (#1137).
  const { kept: clampedAdvancements, excess, usedSlots, usedFightingStyleSlots } = splitAdvancementsBySlotCap(
    storedForAdv.advancements,
    advSlotTotal,
    fightingStyleSlotTotal,
  );

  if (excess.length > 0) {
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

  return {
    effectiveScores,
    hitPoints: effectiveHitPoints,
    effectiveInitBonus,
    clampedAdvancements,
    advSlotTotal,
    usedSlots,
    fightingStyleSlotTotal,
    usedFightingStyleSlots,
    fightingStyleGrantingClasses,
  };
}

// Sums improvements from advancements, ClassFeature row grants (#1691), and SpeciesTrait row grants (#1682) through the ONE deriveImprovementBonuses/deriveImprovementProficiencies evaluator, so a proficiency from any source collapses to one Set entry. A species trait's weapon/armor grant surfaces with source: "feat" on the wire — the same bucket as a ClassFeature row grant, not a new "species" bucket.
// All three inputs are already level-gated at collection time, so level-down behavior is automatic — no separate reversal code.
export function applyFeatLayer(
  clampedAdvancements: AdvancementEntry[],
  classFeatureImprovements: FeatImprovement[],
  speciesTraitImprovements: FeatImprovement[],
  hitDiceTotal: number,
  maxHp: number,
  // PHB'14 p. 291 tier-4 exhaustion halving is edition/level-gated — routes through effectiveMaxHitPoints, the same composition buildHpOpContext/applyHealInTx share; never a fourth inline copy (#1321).
  exhaustionLevel: number,
  classEntries: CharacterWithRelations["classEntries"],
  totalLevel: number,
  edition: RulesEdition,
): {
  featBonuses: ReturnType<typeof deriveImprovementBonuses>;
  effectiveMaxHp: number;
  featProficiencies: ReturnType<typeof deriveImprovementProficiencies>;
} {
  const improvements = [
    ...clampedAdvancements.flatMap((entry) => entry.improvements ?? []),
    ...classFeatureImprovements,
    ...speciesTraitImprovements,
  ];
  const featBonuses = deriveImprovementBonuses(improvements, hitDiceTotal);
  // The subclass term composes into the SAME effectiveMaxHitPoints call as the feat bonus, added BEFORE exhaustion's tier-4 halving — never a second inline + subclassBonus after the fact (#1123).
  // draconicResilienceMaxHpTerm is the one shared function this, effectiveMaxHitPointsForRow, and reconcileAdvancements all resolve the subclass term through.
  const subclassMaxHpBonus = draconicResilienceMaxHpTerm(classEntries, totalLevel, edition);
  const effectiveMaxHp = effectiveMaxHitPoints(maxHp, featBonuses.maxHp + subclassMaxHpBonus, exhaustionLevel, edition);
  // Merged with stored proficiencies by the caller using OR — existing proficiency is never removed.
  const featProficiencies = deriveImprovementProficiencies(improvements);
  return { featBonuses, effectiveMaxHp, featProficiencies };
}

// Derived from EVERY class entry at its own effective level (#1206/#1315), not just the primary entry at total level, so a secondary class's gated actions still surface. Universal actions are served per edition by referenceRouter (#1430); only class-specific ones live here to avoid double-rendering.
export function buildAvailableActionsView(
  classEntries: CharacterWithRelations["classEntries"],
  level: number,
  resources: object | undefined,
  // Martial Arts blanket condition (bestArmor == null && !hasShield, #1218) — gates requiresUnarmored actions.
  unarmoredUnshielded: boolean,
  edition: RulesEdition,
  effectiveScores: Record<string, number>,
  equippedWeaponLight: ReadonlyArray<{ light: boolean }>,
  // Eldritch Knight Weapon Bond (#1854): count of weaponBonded inventory rows, ALREADY clamped by the caller through weaponBondEligible — a stale bonded flag on a disqualified character reads as 0 here until reconcileWeaponBond physically clears it. Folded into a synthetic "weaponBond" pool, reusing the existing resourceKey/resourceAmount gate.
  bondedWeaponCount: number,
): AvailableAction[] {
  const pools = [
    ...(resources && "pools" in resources
      ? (resources as { pools: { key: string; remaining: number }[] }).pools
      : []),
    { key: "weaponBond", remaining: bondedWeaponCount },
  ];
  const abilityMods = Object.fromEntries(
    Object.entries(effectiveScores).map(([key, score]) => [key, abilityModifier(score)]),
  );
  const actions = deriveEntryScopedActions(classEntries, level, pools, unarmoredUnshielded, edition, featureRowsOf, abilityMods);
  return [
    ...actions,
    offHandActionRow(equippedWeaponLight),
  ];
}

// Served for EVERY character — TWF is not class-gated. Enabled only with two Light weapons: the Two-Weapon Fighting style grants off-hand DAMAGE only and never waives this requirement (#1496/#1640).
// Distinct from offHandBusy (a shield OR two weapons). The frontend's twfHint adds the item-name suggestion on top of disabledReason.
function offHandActionRow(equippedWeaponLight: ReadonlyArray<{ light: boolean }>): AvailableAction {
  const enabled = bothWeaponsLight(equippedWeaponLight);
  return {
    key: "offHandAttack",
    name: "Off-Hand Attack",
    cost: "bonusAction",
    enabled,
    ...(enabled ? {} : { disabledReason: "Off-hand attack needs two Light weapons equipped." }),
  };
}

// Clamp-on-read (#124): caps the cumulative per-class levels at the XP-derived total so a not-yet-reconciled over-cap character still renders correctly. Position order = allocation order, so position-0 keeps its levels first and trailing (newest) classes absorb the shortfall.
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
    // Per-entry subclass clamp-on-read (#125): hide a subclass whose grant level exceeds this entry's effective level. Mirrors reconcileSubclass.
    const effectiveLevel = effectiveEntryLevel(level, row.classEntries.length, totalLevel);
    const subclassVisible = subclassActiveAt(effectiveLevel, entry.class?.subclassLevel, edition);
    // Stranded subclass (#1598): a held row edition-tagged for a DIFFERENT edition than the character's — only possible from a catalog retag landing AFTER the pick (crossEditionRejection blocks the pick itself). Gated on subclassVisible because a level-down leaves subclassId in place; ungated, a below-gate character would be shown the explanation before earning a subclass at all.
    const subclassRowEdition = entry.subclassRef?.edition ?? null;
    const subclassUnavailable =
      subclassVisible && Boolean(entry.subclassId) && subclassRowEdition !== null && subclassRowEdition !== edition;
    out.push({
      id: entry.id,
      name: entry.name,
      level,
      subclass: subclassVisible ? (entry.subclass ?? undefined) : undefined,
      subclassId: subclassVisible ? (entry.subclassId ?? undefined) : undefined,
      classId: entry.classId ?? undefined,
      // Served so the frontend never re-derives level >= subclassGateLevel — per-entry, not total character level (multiclass-safe).
      needsSubclass: subclassVisible && (!entry.subclassId || subclassUnavailable),
      subclassUnavailable,
    });
  }
  return out;
}
