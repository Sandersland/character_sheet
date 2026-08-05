// Pure gating/derivation for ClassFeaturesSection — no JSX.

import type {
  AdvancementEntry,
  Character,
  CharacterResources,
  ClassEntry,
  ClassOption,
} from "@/types/character";

export interface ClassFeatureFlags {
  hasPools: boolean;
  hasManeuvers: boolean;
  hasElementsWarrior: boolean;
  hasShadowArts: boolean;
  hasChannelDivinity: boolean;
  hasCloakOfShadows: boolean;
  /** Way of the Four Elements monk (2014-only, #1505) — castDiscipline presence. */
  hasFourElements: boolean;
  hasFeatures: boolean;
  hasFightingStyle: boolean;
  /** Fighting Style feats taken (#1137) — the fightingStyle-slot advancements. */
  fightingStyleFeats: AdvancementEntry[];
}

export interface ClassFeatureView extends ClassFeatureFlags {
  classDef: ClassOption | undefined;
  rosterEntries: ClassEntry[];
  needsSubclass: boolean;
  /** #1598: the primary entry's held subclass row is edition-tagged for a
   *  different edition than the character's own — SubclassSection renders an
   *  explanation alongside the re-pick, rather than hiding the stranded name. */
  subclassUnavailable: boolean;
  maneuverKnownIds: string[];
  isEmpty: boolean;
}

// Serialized roster, or a synthesized single entry before classes[] loads.
// needsSubclass/subclassUnavailable default false in the synthesized stub —
// never computed here (that would be the exact rule-mirror #1598 retired);
// the real values only ever come from the backend-emitted classes[] entry.
function deriveRoster(character: Character): ClassEntry[] {
  if (character.classes && character.classes.length > 0) return character.classes;
  return [{
    id: "primary",
    name: character.class,
    level: character.level,
    subclass: character.subclass,
    needsSubclass: false,
    subclassUnavailable: false,
  }];
}

function deriveManeuverIds(resources: CharacterResources | undefined): string[] {
  if (!resources) return [];
  return resources.maneuversKnown
    .filter((m) => m.maneuverId !== undefined)
    .map((m) => m.maneuverId as string);
}

// A feature's entitlement is availableActions[] presence (#1315) — the same
// gated DERIVED_ACTIONS rows the turn tracker reads — rather than a
// resources boolean, so it's independent of the resources block. Bare
// key-presence is only safe for a key that names ONE feature across both
// editions (castDiscipline, 2014-only, no 2024 counterpart at all); a key
// two editions both grant needs one of the collision-aware helpers below.
function hasAction(character: Character, key: string): boolean {
  return (character.availableActions ?? []).some((a) => a.key === key);
}

// "elementalAttunement" is a SAME-KEY collision across editions (#1505,
// discovered live in browser verification, not a unit-test-caught gap): a
// 2014 Way of the Four Elements monk's Elemental Attunement is a static
// DERIVED_ACTIONS reminder row (actions.ts) with no `resolverKind`, while
// 2024 Warrior of the Elements' is a row-driven ClassFeature toggle
// (toggleActionsFromRow) that always sets `resolverKind: "toggle"` — the
// one field DERIVED_ACTIONS never sets (AvailableAction's own doc comment).
// A bare `hasAction` here fired true for BOTH, rendering WarriorOfElements-
// Section's 2024 Focus-toggle UI alongside FourElementsSection on a 2014
// monk that has never seen a Focus point.
function hasElementsWarriorToggle(character: Character): boolean {
  return (character.availableActions ?? []).some((a) => a.key === "elementalAttunement" && a.resolverKind === "toggle");
}

// "shadowArts"/"cloakOfShadows" are the SAME same-key collision (#1505,
// also caught live in browser verification): 2014 Way of Shadow and 2024
// Warrior of Shadow both grant these exact keys (actions.ts's own comment:
// "Same KEY NAMES as the 2024 rows above... the edition tag plus
// grantSubclassSlugs disambiguates"), but the served AvailableAction never
// carries the row's `resourceKey` (focus vs ki) or edition for the client to
// tell them apart — unlike elementalAttunement, NEITHER row is row-driven,
// so there is no resolverKind signal either. ShadowArtsSection/
// CloakOfShadowsSection are 2024-shaped (hardcoded "focus" copy, the single-
// Darkness cast, the always-3-focus Cloak) with no 2014 counterpart built
// yet — 2014 Way of Shadow's Shadow Arts (a 4-spell 2-ki menu) and Cloak of
// Shadows (free at L11, no resource) are a materially different UI this
// issue does not build. Gating on the character's own edition (already the
// blessed pattern: ShadowArtsSection itself calls fetchShadowArts(character.
// rulesEdition)) keeps the mismatched 2024 UI from ever reaching a 2014
// sheet; the class-feature TEXT (featuresFromRows) already describes both
// editions correctly on its own, so nothing is lost, only the broken cast UI.
function has2024ShadowAction(character: Character, key: string): boolean {
  return character.rulesEdition === "EDITION_2024" && (character.availableActions ?? []).some((a) => a.key === key);
}

function deriveFlags(character: Character): ClassFeatureFlags {
  // Fighting Style is a feat partition (#1137): entitlement follows the slot
  // total, and the taken feats are the fightingStyle-slot advancements — both
  // independent of the resources block.
  const hasFightingStyle = (character.fightingStyleSlots?.total ?? 0) > 0;
  const fightingStyleFeats = (character.advancements ?? []).filter((a) => a.slot === "fightingStyle");
  const hasElementsWarrior = hasElementsWarriorToggle(character);
  const hasShadowArts = has2024ShadowAction(character, "shadowArts");
  const hasCloakOfShadows = has2024ShadowAction(character, "cloakOfShadows");
  const hasFourElements = hasAction(character, "castDiscipline");
  const resources: CharacterResources | undefined = character.resources;
  if (!resources) {
    return {
      hasPools: false,
      hasManeuvers: false,
      hasElementsWarrior,
      hasShadowArts,
      hasChannelDivinity: false,
      hasCloakOfShadows,
      hasFourElements,
      hasFeatures: false,
      hasFightingStyle,
      fightingStyleFeats,
    };
  }
  return {
    hasPools: resources.pools.length > 0,
    hasManeuvers: resources.maneuverChoiceCount !== undefined,
    hasElementsWarrior,
    hasShadowArts,
    hasChannelDivinity: resources.pools.some((p) => p.key === "channelDivinity"),
    hasCloakOfShadows,
    hasFourElements,
    hasFeatures: resources.features.length > 0,
    hasFightingStyle,
    fightingStyleFeats,
  };
}

// Data-driven so a new flag (hasFourElements, #1505) is one more array entry,
// not another branch — keeps this function's own cyclomatic complexity flat
// regardless of how many entitlement flags ClassFeatureFlags grows to.
function isFeatureViewEmpty(
  flags: ClassFeatureFlags,
  hasSubclass: boolean,
  needsSubclass: boolean,
): boolean {
  const signals = [
    flags.hasPools,
    flags.hasManeuvers,
    flags.hasElementsWarrior,
    flags.hasShadowArts,
    flags.hasCloakOfShadows,
    flags.hasFourElements,
    flags.hasFeatures,
    flags.hasFightingStyle,
    hasSubclass,
    needsSubclass,
  ];
  return signals.every((signal) => !signal);
}

export function deriveClassFeatureView(
  character: Character,
  referenceClasses: ClassOption[],
): ClassFeatureView {
  const classDef = referenceClasses.find((c) => c.name === character.class);
  const roster = deriveRoster(character);
  // ClassFeaturesSection/SubclassSection render only the primary entry
  // (roster[0]) today, same scope the retired deriveNeedsSubclass covered —
  // this reads its backend-computed flags rather than re-deriving them.
  const primaryEntry = roster[0];
  const needsSubclass = primaryEntry?.needsSubclass ?? false;
  const subclassUnavailable = primaryEntry?.subclassUnavailable ?? false;
  const flags = deriveFlags(character);

  return {
    classDef,
    rosterEntries: roster,
    needsSubclass,
    subclassUnavailable,
    maneuverKnownIds: deriveManeuverIds(character.resources),
    ...flags,
    isEmpty: isFeatureViewEmpty(flags, Boolean(character.subclass), needsSubclass),
  };
}
