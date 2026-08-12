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

// "elementalAttunement" collides across editions (#1505): the 2024 Warrior toggle
// sets resolverKind "toggle" (only toggleActionsFromRow does); the 2014 reminder row
// doesn't — so bare hasAction leaked the 2024 Focus UI onto a 2014 sheet.
function hasElementsWarriorToggle(character: Character): boolean {
  return (character.availableActions ?? []).some((a) => a.key === "elementalAttunement" && a.resolverKind === "toggle");
}

function deriveFlags(character: Character): ClassFeatureFlags {
  // Fighting Style is a feat partition (#1137): entitlement follows the slot
  // total, and the taken feats are the fightingStyle-slot advancements — both
  // independent of the resources block.
  const hasFightingStyle = (character.fightingStyleSlots?.total ?? 0) > 0;
  const fightingStyleFeats = (character.advancements ?? []).filter((a) => a.slot === "fightingStyle");
  const hasElementsWarrior = hasElementsWarriorToggle(character);
  // "shadowArts"/"cloakOfShadows" collide across editions (same keys, #1505),
  // but unlike elementalAttunement above, both editions now have a correct,
  // fully wire-driven UI (ShadowArtsSection/CloakOfShadowsSection, #1738 —
  // pool label, cost and reminder text all come off the served row), so bare
  // key-presence is the right gate for both.
  const hasShadowArts = hasAction(character, "shadowArts");
  const hasCloakOfShadows = hasAction(character, "cloakOfShadows");
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
//
// Checks every roster entry, not just the primary one (#1602): a multiclass
// character can hold or need a subclass on a SECONDARY entry only, and the
// section must still render for them.
function isFeatureViewEmpty(flags: ClassFeatureFlags, roster: ClassEntry[]): boolean {
  const signals = [
    flags.hasPools,
    flags.hasManeuvers,
    flags.hasElementsWarrior,
    flags.hasShadowArts,
    flags.hasCloakOfShadows,
    flags.hasFourElements,
    flags.hasFeatures,
    flags.hasFightingStyle,
    roster.some((entry) => Boolean(entry.subclass)),
    roster.some((entry) => entry.needsSubclass),
  ];
  return signals.every((signal) => !signal);
}

/** Class-name to ClassOption lookup; shared by deriveClassFeatureView and ClassFeaturesSection. */
export function resolveClassDef(className: string, referenceClasses: ClassOption[]): ClassOption | undefined {
  return referenceClasses.find((c) => c.name === className);
}

export function deriveClassFeatureView(
  character: Character,
  referenceClasses: ClassOption[],
): ClassFeatureView {
  const classDef = resolveClassDef(character.class, referenceClasses);
  const roster = deriveRoster(character);
  const flags = deriveFlags(character);

  return {
    classDef,
    rosterEntries: roster,
    maneuverKnownIds: deriveManeuverIds(character.resources),
    ...flags,
    isEmpty: isFeatureViewEmpty(flags, roster),
  };
}
