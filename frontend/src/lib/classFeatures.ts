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

// Warrior of the Elements/Shadow entitlement is availableActions[] presence
// (#1315) — the same gated DERIVED_ACTIONS rows the turn tracker reads —
// rather than a resources boolean, so it's independent of the resources block.
function hasAction(character: Character, key: string): boolean {
  return (character.availableActions ?? []).some((a) => a.key === key);
}

function deriveFlags(character: Character): ClassFeatureFlags {
  // Fighting Style is a feat partition (#1137): entitlement follows the slot
  // total, and the taken feats are the fightingStyle-slot advancements — both
  // independent of the resources block.
  const hasFightingStyle = (character.fightingStyleSlots?.total ?? 0) > 0;
  const fightingStyleFeats = (character.advancements ?? []).filter((a) => a.slot === "fightingStyle");
  const hasElementsWarrior = hasAction(character, "elementalAttunement");
  const hasShadowArts = hasAction(character, "shadowArts");
  const hasCloakOfShadows = hasAction(character, "cloakOfShadows");
  const resources: CharacterResources | undefined = character.resources;
  if (!resources) {
    return {
      hasPools: false,
      hasManeuvers: false,
      hasElementsWarrior,
      hasShadowArts,
      hasChannelDivinity: false,
      hasCloakOfShadows,
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
