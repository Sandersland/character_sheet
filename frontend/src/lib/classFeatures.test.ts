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
  subclassLevel: 3,
  subclasses: [{ id: "champion", name: "Champion" }],
} as unknown as ClassOption;

describe("deriveClassFeatureView", () => {
  it("synthesizes a single roster entry when classes[] is absent", () => {
    const view = deriveClassFeatureView(makeChar({ subclass: "Champion" }), [fighterDef]);
    expect(view.rosterEntries).toEqual([
      { id: "primary", name: "Fighter", level: 5, subclass: "Champion" },
    ]);
  });

  it("uses serialized classes[] when present", () => {
    const classes = [{ id: "c1", name: "Fighter", level: 5 }] as unknown as Character["classes"];
    const view = deriveClassFeatureView(makeChar({ classes }), [fighterDef]);
    expect(view.rosterEntries).toBe(classes);
  });

  it("flags needsSubclass only when eligible and unchosen", () => {
    expect(deriveClassFeatureView(makeChar({ level: 5, subclass: undefined }), [fighterDef]).needsSubclass).toBe(true);
    expect(deriveClassFeatureView(makeChar({ level: 5, subclass: "Champion" }), [fighterDef]).needsSubclass).toBe(false);
    expect(deriveClassFeatureView(makeChar({ level: 2, subclass: undefined }), [fighterDef]).needsSubclass).toBe(false);
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

  it("derives entitlement flags from resources, and Fighting Style from slots + advancements", () => {
    const view = deriveClassFeatureView(
      makeChar(
        {
          fightingStyleSlots: { total: 1, used: 1 },
          advancements: [
            { id: "fs1", slot: "fightingStyle", featId: "archery", featName: "Archery" },
          ] as unknown as Character["advancements"],
        },
        {
          pools: [{ key: "channelDivinity" }] as unknown as CharacterResources["pools"],
          maneuverChoiceCount: 3,
          shadowArtsAvailable: true,
          cloakOfShadowsAvailable: true,
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
    const view = deriveClassFeatureView(makeChar({ level: 5, subclass: undefined }), [fighterDef]);
    expect(view.isEmpty).toBe(false);
  });
});
