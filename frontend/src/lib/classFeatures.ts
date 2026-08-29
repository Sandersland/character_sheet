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
  hasFourElements: boolean;
  hasFeatures: boolean;
  hasFightingStyle: boolean;
  fightingStyleFeats: AdvancementEntry[];
}

export interface ClassFeatureView extends ClassFeatureFlags {
  classDef: ClassOption | undefined;
  rosterEntries: ClassEntry[];
  maneuverKnownIds: string[];
  isEmpty: boolean;
}

// needsSubclass/subclassUnavailable stay false in the synthesized stub — never re-derive them here; only the backend-emitted classes[] entry carries the real values (#1598).
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

// hasAction is safe only for a key naming ONE feature across both editions (e.g. castDiscipline, 2014-only); a key both editions grant needs one of the collision-aware helpers below.
function hasAction(character: Character, key: string): boolean {
  return (character.availableActions ?? []).some((a) => a.key === key);
}

// elementalAttunement collides across editions — only the 2024 toggle sets resolverKind "toggle"; bare hasAction would leak the 2024 UI onto a 2014 sheet (#1505).
function hasElementsWarriorToggle(character: Character): boolean {
  return (character.availableActions ?? []).some((a) => a.key === "elementalAttunement" && a.resolverKind === "toggle");
}

function deriveFlags(character: Character): ClassFeatureFlags {
  // Fighting Style entitlement follows fightingStyleSlots.total, and the taken feats are the fightingStyle-slot advancements — both independent of the resources block (#1137).
  const hasFightingStyle = (character.fightingStyleSlots?.total ?? 0) > 0;
  const fightingStyleFeats = (character.advancements ?? []).filter((a) => a.slot === "fightingStyle");
  const hasElementsWarrior = hasElementsWarriorToggle(character);
  // shadowArts/cloakOfShadows collide across editions too, but unlike elementalAttunement both editions have a correct wire-driven UI, so bare key-presence is the right gate for both (#1505).
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

// Checks every roster entry, not just the primary one: a multiclass character can hold or need a subclass on a secondary entry only, and the section must still render for them (#1602).
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
