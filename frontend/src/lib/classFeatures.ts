// Pure gating/derivation for ClassFeaturesSection — no JSX.

import type {
  Character,
  CharacterResources,
  ClassEntry,
  ClassOption,
  FightingStyleKey,
} from "@/types/character";

export interface ClassFeatureFlags {
  hasPools: boolean;
  hasManeuvers: boolean;
  hasDisciplines: boolean;
  hasShadowArts: boolean;
  hasChannelDivinity: boolean;
  hasCloakOfShadows: boolean;
  hasFeatures: boolean;
  hasFightingStyle: boolean;
  fightingStyle: FightingStyleKey | null;
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

function deriveFlags(resources: CharacterResources | undefined): ClassFeatureFlags {
  if (!resources) {
    return {
      hasPools: false,
      hasManeuvers: false,
      hasDisciplines: false,
      hasShadowArts: false,
      hasChannelDivinity: false,
      hasCloakOfShadows: false,
      hasFeatures: false,
      hasFightingStyle: false,
      fightingStyle: null,
    };
  }
  return {
    hasPools: resources.pools.length > 0,
    hasManeuvers: resources.maneuverChoiceCount !== undefined,
    hasDisciplines: resources.disciplineChoiceCount !== undefined,
    hasShadowArts: resources.shadowArtsAvailable === true,
    hasChannelDivinity: resources.pools.some((p) => p.key === "channelDivinity"),
    hasCloakOfShadows: resources.cloakOfShadowsAvailable === true,
    hasFeatures: resources.features.length > 0,
    hasFightingStyle: (resources.fightingStyleChoiceCount ?? 0) > 0,
    fightingStyle: resources.fightingStyle ?? null,
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
    !flags.hasDisciplines &&
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
  const flags = deriveFlags(character.resources);

  return {
    classDef,
    rosterEntries: deriveRoster(character),
    needsSubclass,
    maneuverKnownIds: deriveManeuverIds(character.resources),
    ...flags,
    isEmpty: isFeatureViewEmpty(flags, Boolean(character.subclass), needsSubclass),
  };
}
