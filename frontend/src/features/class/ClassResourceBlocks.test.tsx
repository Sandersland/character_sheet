import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";

import ClassResourceBlocks from "@/features/class/ClassResourceBlocks";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character, CharacterResources } from "@/types/character";
import type { ClassFeatureView } from "@/lib/classFeatures";

// #1422: explicitly typed so a drift between this fixture and the real
// CharacterResources shape (e.g. a field the server always sends but the
// frontend type omits) fails tsc instead of hiding behind the outer
// `as unknown as Character` cast below.
const resources: CharacterResources = {
  features: [],
  maneuverChoiceCount: 3,
  pools: [],
  maneuversKnown: [],
  toolProficienciesKnown: [],
  expertiseKnown: [],
  choicesKnown: {},
  subclassChoices: [],
};

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    resources,
    ...overrides,
  } as unknown as Character;
}

function makeView(overrides: Partial<ClassFeatureView> = {}): ClassFeatureView {
  return {
    classDef: undefined,
    rosterEntries: [],
    needsSubclass: false,
    subclassUnavailable: false,
    maneuverKnownIds: [],
    isEmpty: false,
    hasPools: false,
    hasManeuvers: true,
    hasElementsWarrior: false,
    hasShadowArts: false,
    hasChannelDivinity: false,
    hasCloakOfShadows: false,
    hasFourElements: false,
    hasFeatures: false,
    hasFightingStyle: false,
    fightingStyleFeats: [],
    ...overrides,
  };
}

// Guards the ClassResourceBlocks -> ManeuversSection wiring (#1316): the DC is
// a top-level rider field (character.maneuvers), not part of `resources`, so
// nothing type-checks if the wiring line is dropped — only a render assertion
// catches it. (Regression case: a reviewer deleted the wiring line and both
// tsc and the rest of the frontend suite stayed green.)
describe("ClassResourceBlocks maneuver Save DC wiring (#1316)", () => {
  it("renders the Maneuver Save DC when the character has the maneuvers rider", () => {
    const character = makeCharacter({ maneuvers: { saveDC: 14 } });
    renderWithCharacter(<ClassResourceBlocks view={makeView()} busy={false} run={vi.fn()} />, character);

    expect(screen.getByText(/Maneuver Save DC/)).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
  });

  it("renders no Maneuver Save DC line when the character has no maneuvers rider", () => {
    const character = makeCharacter({ maneuvers: undefined });
    renderWithCharacter(<ClassResourceBlocks view={makeView()} busy={false} run={vi.fn()} />, character);

    expect(screen.queryByText(/Maneuver Save DC/)).not.toBeInTheDocument();
  });
});
