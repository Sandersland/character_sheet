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
  hasFeatures: boolean;
  hasFightingStyle: boolean;
  /** Fighting Style feats taken (#1137) — the fightingStyle-slot advancements. */
  fightingStyleFeats: AdvancementEntry[];
}

export interface ClassFeatureView extends ClassFeatureFlags {
  classDef: ClassOption | undefined;
  rosterEntries: ClassEntry[];
  needsSubclass: boolean;
  maneuverKnownIds: string[];
  isEmpty: boolean;
}

// Serialized roster, or a synthesized single entry before classes[] loads.
function deriveRoster(character: Character): ClassEntry[] {
  if (character.classes && character.classes.length > 0) return character.classes;
  return [{ id: "primary", name: character.class, level: character.level, subclass: character.subclass }];
}

function deriveNeedsSubclass(character: Character, classDef: ClassOption | undefined): boolean {
  if (!classDef) return false;
  return character.level >= classDef.subclassLevel && !character.subclass;
}

function deriveManeuverIds(resources: CharacterResources | undefined): string[] {
  if (!resources) return [];
  return resources.maneuversKnown
    .filter((m) => m.maneuverId !== undefined)
    .map((m) => m.maneuverId as string);
}

function deriveFlags(character: Character): ClassFeatureFlags {
  // Fighting Style is a feat partition (#1137): entitlement follows the slot
  // total, and the taken feats are the fightingStyle-slot advancements — both
  // independent of the resources block.
  const hasFightingStyle = (character.fightingStyleSlots?.total ?? 0) > 0;
  const fightingStyleFeats = (character.advancements ?? []).filter((a) => a.slot === "fightingStyle");
  const resources: CharacterResources | undefined = character.resources;
  if (!resources) {
    return {
      hasPools: false,
      hasManeuvers: false,
      hasElementsWarrior: false,
      hasShadowArts: false,
      hasChannelDivinity: false,
      hasCloakOfShadows: false,
      hasFeatures: false,
      hasFightingStyle,
      fightingStyleFeats,
    };
  }
  return {
    hasPools: resources.pools.length > 0,
    hasManeuvers: resources.maneuverChoiceCount !== undefined,
    hasElementsWarrior: resources.elementalAttunementAvailable === true,
    hasShadowArts: resources.shadowArtsAvailable === true,
    hasChannelDivinity: resources.pools.some((p) => p.key === "channelDivinity"),
    hasCloakOfShadows: resources.cloakOfShadowsAvailable === true,
    hasFeatures: resources.features.length > 0,
    hasFightingStyle,
    fightingStyleFeats,
  };
}

function isFeatureViewEmpty(
  flags: ClassFeatureFlags,
  hasSubclass: boolean,
  needsSubclass: boolean,
): boolean {
  return (
    !flags.hasPools &&
    !flags.hasManeuvers &&
    !flags.hasElementsWarrior &&
    !flags.hasShadowArts &&
    !flags.hasCloakOfShadows &&
    !flags.hasFeatures &&
    !flags.hasFightingStyle &&
    !hasSubclass &&
    !needsSubclass
  );
}

export function deriveClassFeatureView(
  character: Character,
  referenceClasses: ClassOption[],
): ClassFeatureView {
  const classDef = referenceClasses.find((c) => c.name === character.class);
  const needsSubclass = deriveNeedsSubclass(character, classDef);
  const flags = deriveFlags(character);

  return {
    classDef,
    rosterEntries: deriveRoster(character),
    needsSubclass,
    maneuverKnownIds: deriveManeuverIds(character.resources),
    ...flags,
    isEmpty: isFeatureViewEmpty(flags, Boolean(character.subclass), needsSubclass),
  };
}
