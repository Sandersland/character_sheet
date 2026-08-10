// Clamp-on-read blocks here pair 1:1 with LEVEL_GATED_RECONCILERS (lib/leveling/level-reconciliation.ts).

import type { RulesEdition } from "@character-sheet/shared-types";

import {
  abilityModifier,
  bothWeaponsLight,
  characterAdvancementSlots,
  characterFightingStyleFeatSlots,
  deriveDeflectSpec,
  deriveImprovementBonuses,
  deriveImprovementProficiencies,
} from "@/lib/srd/srd.js";
import type { EffectSpec } from "@/lib/combat/effects.js";
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

// Resources clamp-on-read: derive class/subclass pools + level-gated caps, then
// layer stored `used` counts and known lists (clamped to caps). Returns the
// resources view (undefined for classes with no pools) plus the raw
// announcedSaveDC number (#1589, renamed from the Fighter-specific
// maneuverSaveDC) — serializeCharacter folds it into the top-level `maneuvers`
// rider (#1316), so it isn't part of the resources payload. Fighting Style is
// a feat now (#1137) — surfaced via top-level fightingStyleSlots +
// advancements, not here. The choice-cap fields are entry-scoped (#1177) via
// deriveEntryScopedResources — mirrors loadResourcesReconcileState
// (level-reconciliation.ts) so both sides compute the legal limit through the
// one shared rule function.
export function buildResourcesView(
  row: CharacterWithRelations,
  level: number,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
): { resources: object | undefined; announcedSaveDC: number | undefined; classFeatureImprovements: FeatImprovement[] } {
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

  // Row-driven passive grants (#1691) — level/edition/subclass-active gated
  // the SAME way `resources.features` already is (deriveEntryScopedResources'
  // own per-entry loop); applyFeatLayer merges this with advancement-sourced
  // improvements through the shared deriveImprovementBonuses/
  // deriveImprovementProficiencies evaluator.
  return { resources, announcedSaveDC: derivedRes?.announcedSaveDC, classFeatureImprovements: derivedRes?.improvements ?? [] };
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

// Improvement modifier layer: sum structured improvements from the kept
// advancements (origin feats + slot-bounded entries) TOGETHER WITH active
// ClassFeature row grants (#1691) AND active SpeciesTrait row grants (#1682,
// serialize/species.ts's buildSpeciesTraitsView) through the ONE
// deriveImprovementBonuses/deriveImprovementProficiencies evaluator — the
// merge point that makes a proficiency granted by any of the three sources
// collapse to one Set entry (no separate dedup: see
// deriveImprovementProficiencies' own header). RACE_PROFICIENCY_GRANTS
// (retired #1682) used to be a fourth, name-keyed source outside this merge;
// a species trait's weapon/armor grant now surfaces with source: "feat" in
// the wire proficiency arrays, the SAME bucket a ClassFeature row grant
// already uses (#1691 precedent) — not a new "species" bucket.
// Because clampedAdvancements already excludes over-cap feats and
// classFeatureImprovements/speciesTraitImprovements are already gated at
// collection time (buildResourcesView via deriveEntryScopedResources;
// buildSpeciesTraitsView via the character's own species/variant selection),
// level-down behavior for every source is automatic — no separate reversal
// code needed. perLevel bonuses (e.g. Tough, Dwarven Toughness) scale with
// hitDiceTotal (applied level) for EVERY source.
export function applyFeatLayer(
  clampedAdvancements: AdvancementEntry[],
  classFeatureImprovements: FeatImprovement[],
  speciesTraitImprovements: FeatImprovement[],
  hitDiceTotal: number,
  maxHp: number,
  // #1321: exhaustion's PHB'14 p. 291 tier-4 halving is edition/level-gated,
  // so this needs both to route through effectiveMaxHitPoints (the composition
  // shared with buildHpOpContext/applyHealInTx — never a fourth inline copy).
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
  // #1123: the subclass term composes into the SAME effectiveMaxHitPoints call
  // as the feat bonus — added to the base BEFORE exhaustion's tier-4 halving,
  // never a second inline `+ subclassBonus` after the fact (see #1123's own
  // composition-order acceptance case, mirroring #1321's decision 2).
  // draconicResilienceMaxHpTerm is the ONE shared function this clamp-on-read,
  // the write seam (effectiveMaxHitPointsForRow), and the reconciler
  // (reconcileAdvancements) all resolve the subclass term through.
  const subclassMaxHpBonus = draconicResilienceMaxHpTerm(classEntries, totalLevel, edition);
  const effectiveMaxHp = effectiveMaxHitPoints(maxHp, featBonuses.maxHp + subclassMaxHpBonus, exhaustionLevel, edition);
  // Proficiency grants from feats + class feature rows (skills + saving
  // throws + armor + weapons). Merged with stored proficiencies by the
  // caller using OR — existing proficiency is never removed.
  const featProficiencies = deriveImprovementProficiencies(improvements);
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
  effectiveScores: Record<string, number>,
  // Light flags of the currently-equipped weapons — the off-hand eligibility
  // input (#1435), computed by the caller from the already-serialized inventory.
  equippedWeaponLight: ReadonlyArray<{ light: boolean }>,
): AvailableAction[] {
  const pools =
    resources && "pools" in resources
      ? (resources as { pools: { key: string; remaining: number }[] }).pools
      : [];
  // featureRowsOf (#1528 chunk 0): a Fighter entry's row-driven actions
  // (Second Wind/Action Surge) surface here through the SAME carrier
  // buildResourcesView passes for its pools/features.
  const actions = deriveEntryScopedActions(classEntries, level, pools, unarmoredUnshielded, edition, featureRowsOf);
  return [
    ...withDeflectSpecs(actions, classEntries, level, effectiveScores, edition),
    // Off-hand / Two-Weapon Fighting eligibility (#1435) — served for EVERY
    // character (TWF is not class-gated), enabled only when both equipped
    // weapons are Light (`bothWeaponsLight`; the Two-Weapon Fighting style
    // grants off-hand DAMAGE only and never waives this, #1496/#1640, so no
    // `hasOffHandAbilityDamage` clause here). Distinct from `offHandBusy` (a
    // shield OR two weapons) — the distinction this row exists to make.
    offHandActionRow(equippedWeaponLight),
  ];
}

// The off-hand bonus-action eligibility row (#1435): `enabled` is the pure
// two-Light-weapons rule; when disabled, the reason names that requirement
// (the frontend's twfHint adds the concrete item-name suggestion on top).
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

// Attaches the resolved Deflect Attacks / Deflect Missiles roll specs (#1435)
// onto the served rows via the #1381 `effect` field: the base row carries the
// reduction spec, the redirect / throw-back row its own. Both resolve off the
// Monk entry's effective level (`effectiveEntryLevel`) and the character's Dex
// mod, via the ONE edition-forked `deriveDeflectSpec` rule. A no-op for a
// non-Monk (no deflect row is present to annotate).
function withDeflectSpecs(
  actions: AvailableAction[],
  classEntries: CharacterWithRelations["classEntries"],
  level: number,
  effectiveScores: Record<string, number>,
  edition: RulesEdition,
): AvailableAction[] {
  const monkEntry = classEntries.find((e) => e.name?.toLowerCase() === "monk");
  if (!monkEntry) return actions;
  const monkLevel = effectiveEntryLevel(monkEntry.level, classEntries.length, level);
  const dexMod = abilityModifier(effectiveScores.dexterity ?? 10);
  const { reduction, redirect } = deriveDeflectSpec(monkLevel, dexMod, edition);
  return actions.map((a) => {
    if (a.key === "deflectAttacks" || a.key === "deflectMissiles") {
      return { ...a, effect: rollAsEffect(reduction, "utility") };
    }
    if (a.key === "deflectAttacksRedirect" || a.key === "deflectMissilesThrow") {
      return { ...a, effect: rollAsEffect(redirect, "damage") };
    }
    return a;
  });
}

// Wrap a resolved roll as a minimal EffectSpec — the same "utility kind carries
// dice" shape a maneuver's served effect uses (deriveManeuverEffect), so the
// frontend reads `action.effect.dice` verbatim as its RollSpec.
function rollAsEffect(
  dice: { count: number; faces: number; modifier: number },
  effectType: EffectSpec["effectType"],
): EffectSpec {
  return { effectType, dice, scaling: { mode: "none" } };
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
    //
    // Gated on `subclassVisible` for the same reason `subclass`/`subclassId`
    // below are: a level-down leaves the subclassId in place and relies on the
    // clamp-on-read to hide it, so an ungated flag would report a stranded pick
    // the sheet is deliberately not showing. That is not merely inconsistent —
    // `character.subclass` (character-serialize.ts) reads the RAW entry column
    // and is NOT level-gated, so SubclassSection's early return would not fire
    // and a below-gate character would be shown the explanation and invited to
    // re-pick a subclass it has not yet earned.
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
