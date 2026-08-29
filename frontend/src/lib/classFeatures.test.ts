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

  // needsSubclass/subclassUnavailable are backend-computed (buildClassesView) and passed through unchanged for every roster entry, never re-derived from level/subclassGateLevel (#1598/#1602).
  it("passes needsSubclass/subclassUnavailable through unchanged for every roster entry, not just the first", () => {
    const classes = [
      { id: "c1", name: "Fighter", level: 5, needsSubclass: false, subclassUnavailable: false },
      { id: "c2", name: "Warlock", level: 3, subclass: "The Archfey", needsSubclass: true, subclassUnavailable: true },
    ] as unknown as Character["classes"];
    const view = deriveClassFeatureView(makeChar({ classes }), [fighterDef]);
    expect(view.rosterEntries[0].needsSubclass).toBe(false);
    expect(view.rosterEntries[1].needsSubclass).toBe(true);
    expect(view.rosterEntries[1].subclassUnavailable).toBe(true);
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
          rulesEdition: "EDITION_2024",
          fightingStyleSlots: { total: 1, used: 1 },
          advancements: [
            { id: "fs1", slot: "fightingStyle", featId: "archery", featName: "Archery" },
          ] as unknown as Character["advancements"],
          // shadowArts/cloakOfShadows entitlement is availableActions[] presence, edition-agnostic since #1738, not a resources boolean (#1315).
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
      makeChar({
        rulesEdition: "EDITION_2024",
        availableActions: [{ key: "shadowArts", name: "Shadow Arts (Darkness)", cost: "action", enabled: true }],
      }),
      [fighterDef],
    );
    expect(view.hasShadowArts).toBe(true);
    expect(view.hasCloakOfShadows).toBe(false);
    expect(view.hasElementsWarrior).toBe(false);
  });

  // Both editions grant the same shadowArts/cloakOfShadows keys — bare key-presence is correct for either since ShadowArtsSection/CloakOfShadowsSection are wire-driven for both (#1738).
  it("hasShadowArts/hasCloakOfShadows are true on a 2014 character carrying the same action keys", () => {
    const view = deriveClassFeatureView(
      makeChar({
        rulesEdition: "EDITION_2014",
        availableActions: [
          { key: "shadowArts", name: "Shadow Arts", cost: "action", enabled: true, reminder: "Spend 2 ki…" },
          { key: "cloakOfShadows", name: "Cloak of Shadows", cost: "action", enabled: true, reminder: "…" },
        ],
      }),
      [fighterDef],
    );
    expect(view.hasShadowArts).toBe(true);
    expect(view.hasCloakOfShadows).toBe(true);
  });

  // ClassResourceBlocks.tsx gates WarriorOfElementsSection on this flag — a wrong/renamed key here would silently delete that panel.
  it("hasElementsWarrior is true when availableActions contains the row-driven (resolverKind: toggle) elementalAttunement", () => {
    const view = deriveClassFeatureView(
      makeChar({
        availableActions: [
          { key: "elementalAttunement", name: "Elemental Attunement", cost: "free", enabled: true, resolverKind: "toggle" },
        ],
      }),
      [fighterDef],
    );
    expect(view.hasElementsWarrior).toBe(true);
  });

  // The 2014 reminder-only elementalAttunement row (no resolverKind) must keep hasElementsWarrior false so WarriorOfElementsSection's Focus-toggle UI never renders for it (#1505).
  it("hasElementsWarrior is false for the 2014 reminder-only elementalAttunement row (no resolverKind)", () => {
    const view = deriveClassFeatureView(
      makeChar({
        availableActions: [
          { key: "elementalAttunement", name: "Elemental Attunement", cost: "action", enabled: true, reminder: "Briefly control elemental forces…" },
          { key: "castDiscipline", name: "Elemental Discipline", cost: "action", enabled: true },
        ],
      }),
      [fighterDef],
    );
    expect(view.hasElementsWarrior).toBe(false);
    expect(view.hasFourElements).toBe(true);
  });

  // Same availableActions[]-presence gate as Warrior of Shadow/Elements, not a resources boolean — 2014-only (#1505).
  it("hasFourElements is true when availableActions contains castDiscipline, and false otherwise", () => {
    const withDiscipline = deriveClassFeatureView(
      makeChar({ availableActions: [{ key: "castDiscipline", name: "Elemental Discipline", cost: "action", enabled: true }] }),
      [fighterDef],
    );
    expect(withDiscipline.hasFourElements).toBe(true);
    expect(withDiscipline.isEmpty).toBe(false);

    const without = deriveClassFeatureView(makeChar({ availableActions: [] }), [fighterDef]);
    expect(without.hasFourElements).toBe(false);
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

  // isEmpty must consider every roster entry, not just the primary — a secondary entry needing/holding a subclass alone must still count (#1602).
  it("isEmpty stays false when only a SECONDARY roster entry needs a subclass", () => {
    const classes = [
      { id: "c1", name: "Fighter", level: 5, needsSubclass: false, subclassUnavailable: false },
      { id: "c2", name: "Warlock", level: 3, needsSubclass: true, subclassUnavailable: false },
    ] as unknown as Character["classes"];
    const view = deriveClassFeatureView(makeChar({ classes, subclass: undefined }), [fighterDef]);
    expect(view.isEmpty).toBe(false);
  });

  it("isEmpty stays false when only a SECONDARY roster entry holds a subclass", () => {
    const classes = [
      { id: "c1", name: "Fighter", level: 5, needsSubclass: false, subclassUnavailable: false },
      { id: "c2", name: "Warlock", level: 3, subclass: "The Fiend", needsSubclass: false, subclassUnavailable: false },
    ] as unknown as Character["classes"];
    const view = deriveClassFeatureView(makeChar({ classes, subclass: undefined }), [fighterDef]);
    expect(view.isEmpty).toBe(false);
  });
});
