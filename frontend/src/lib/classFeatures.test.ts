import { describe, it, expect } from "vitest";

import { deriveClassFeatureView } from "@/lib/classFeatures";
import type { Character, CharacterResources, ClassOption } from "@/types/character";

function makeChar(overrides: Partial<Character>, resources?: Partial<CharacterResources>): Character {
  return {
    id: "char-1",
    class: "Fighter",
    level: 5,
    resources: resources
      ? { features: [], pools: [], maneuversKnown: [], toolProficienciesKnown: [], ...resources }
      : undefined,
    ...overrides,
  } as unknown as Character;
}

const fighterDef = {
  id: "fighter",
  name: "Fighter",
  subclassGateLevel: 3,
  subclasses: [{ id: "champion", name: "Champion" }],
} as unknown as ClassOption;

describe("deriveClassFeatureView", () => {
  it("synthesizes a single roster entry when classes[] is absent", () => {
    const view = deriveClassFeatureView(makeChar({ subclass: "Champion" }), [fighterDef]);
    expect(view.rosterEntries).toEqual([
      { id: "primary", name: "Fighter", level: 5, subclass: "Champion", needsSubclass: false, subclassUnavailable: false },
    ]);
  });

  it("uses serialized classes[] when present", () => {
    const classes = [
      { id: "c1", name: "Fighter", level: 5, needsSubclass: false, subclassUnavailable: false },
    ] as unknown as Character["classes"];
    const view = deriveClassFeatureView(makeChar({ classes }), [fighterDef]);
    expect(view.rosterEntries).toBe(classes);
  });

  // #1598: needsSubclass/subclassUnavailable are backend-computed
  // (buildClassesView) and read off classes[0] — deriveClassFeatureView must
  // NOT re-derive them from character.level/classDef.subclassGateLevel (that
  // mirror is what stranded a character on a cross-edition subclass row with
  // no way out, since a held subclass name made the old client-side
  // `!character.subclass` half of the check false).
  it("reads needsSubclass/subclassUnavailable off classes[0] rather than re-deriving them", () => {
    function withEntry(needsSubclass: boolean, subclassUnavailable = false) {
      const classes = [
        { id: "c1", name: "Fighter", level: 5, needsSubclass, subclassUnavailable },
      ] as unknown as Character["classes"];
      return deriveClassFeatureView(makeChar({ classes }), [fighterDef]);
    }
    expect(withEntry(true).needsSubclass).toBe(true);
    expect(withEntry(false).needsSubclass).toBe(false);
    expect(withEntry(true, true).subclassUnavailable).toBe(true);
    expect(withEntry(true, false).subclassUnavailable).toBe(false);
  });

  it("defaults needsSubclass/subclassUnavailable to false when classes[] hasn't loaded yet (never computed from level)", () => {
    const view = deriveClassFeatureView(makeChar({ level: 5, subclass: undefined }), [fighterDef]);
    expect(view.needsSubclass).toBe(false);
    expect(view.subclassUnavailable).toBe(false);
    expect(deriveClassFeatureView(makeChar({ level: 5 }), []).needsSubclass).toBe(false);
  });

  it("collects maneuver ids, skipping entries without a maneuverId", () => {
    const view = deriveClassFeatureView(
      makeChar({}, {
        maneuverChoiceCount: 2,
        maneuversKnown: [
          { id: "e1", maneuverId: "trip", name: "Trip" },
          { id: "e2", name: "Legacy" },
        ] as unknown as CharacterResources["maneuversKnown"],
      }),
      [fighterDef],
    );
    expect(view.maneuverKnownIds).toEqual(["trip"]);
  });

  it("derives entitlement flags from resources + availableActions, and Fighting Style from slots + advancements", () => {
    const view = deriveClassFeatureView(
      makeChar(
        {
          fightingStyleSlots: { total: 1, used: 1 },
          advancements: [
            { id: "fs1", slot: "fightingStyle", featId: "archery", featName: "Archery" },
          ] as unknown as Character["advancements"],
          // shadowArts/cloakOfShadows entitlement is availableActions[] presence (#1315),
          // not a resources boolean.
          availableActions: [
            { key: "shadowArts", name: "Shadow Arts (Darkness)", cost: "action", enabled: true },
            { key: "cloakOfShadows", name: "Cloak of Shadows", cost: "action", enabled: true },
          ],
        },
        {
          pools: [{ key: "channelDivinity" }] as unknown as CharacterResources["pools"],
          maneuverChoiceCount: 3,
          features: [{ source: "class", name: "F", description: "d" }] as unknown as CharacterResources["features"],
        },
      ),
      [fighterDef],
    );
    expect(view.hasPools).toBe(true);
    expect(view.hasManeuvers).toBe(true);
    expect(view.hasShadowArts).toBe(true);
    expect(view.hasChannelDivinity).toBe(true);
    expect(view.hasCloakOfShadows).toBe(true);
    expect(view.hasFightingStyle).toBe(true);
    expect(view.hasFeatures).toBe(true);
    expect(view.fightingStyleFeats.map((f) => f.featName)).toEqual(["Archery"]);
    expect(view.isEmpty).toBe(false);
  });

  it("hasShadowArts/hasCloakOfShadows/hasElementsWarrior are false when availableActions lacks the matching key", () => {
    const view = deriveClassFeatureView(
      makeChar({ availableActions: [{ key: "shadowArts", name: "Shadow Arts (Darkness)", cost: "action", enabled: true }] }),
      [fighterDef],
    );
    expect(view.hasShadowArts).toBe(true);
    expect(view.hasCloakOfShadows).toBe(false);
    expect(view.hasElementsWarrior).toBe(false);
  });

  // Positive case for hasElementsWarrior — previously untested: a wrong/renamed
  // key here would silently delete the whole Warrior of the Elements panel
  // (ClassResourceBlocks.tsx gates WarriorOfElementsSection on this flag) with
  // no failing test to catch it.
  it("hasElementsWarrior is true when availableActions contains elementalAttunement", () => {
    const view = deriveClassFeatureView(
      makeChar({ availableActions: [{ key: "elementalAttunement", name: "Elemental Attunement", cost: "free", enabled: true }] }),
      [fighterDef],
    );
    expect(view.hasElementsWarrior).toBe(true);
  });

  it("reports all flags false and isEmpty true when no resources", () => {
    const view = deriveClassFeatureView(makeChar({ subclass: undefined }), []);
    expect(view.hasPools).toBe(false);
    expect(view.hasManeuvers).toBe(false);
    expect(view.hasChannelDivinity).toBe(false);
    expect(view.hasFightingStyle).toBe(false);
    expect(view.fightingStyleFeats).toEqual([]);
    expect(view.isEmpty).toBe(true);
  });

  it("isEmpty stays false when a subclass exists even with no resources", () => {
    const view = deriveClassFeatureView(makeChar({ subclass: "Champion" }), []);
    expect(view.isEmpty).toBe(false);
  });

  it("isEmpty stays false when a subclass is still needed", () => {
    const classes = [
      { id: "c1", name: "Fighter", level: 5, needsSubclass: true, subclassUnavailable: false },
    ] as unknown as Character["classes"];
    const view = deriveClassFeatureView(makeChar({ classes, subclass: undefined }), [fighterDef]);
    expect(view.isEmpty).toBe(false);
  });
});
