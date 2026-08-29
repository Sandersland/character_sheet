import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useToolProficiencyChoices } from "@/features/character-create/useToolProficiencyChoices";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import type { BackgroundOption, ClassOption } from "@/types/character";

function makeDraft(overrides: Partial<CharacterDraft> = {}): CharacterDraft {
  return {
    name: "",
    alignment: "",
    speciesId: "",
    variantId: "",
    className: "",
    subclass: "",
    subclassId: "",
    background: "",
    useCustomBackground: false,
    customBackground: "",
    abilityMethod: "manual",
    abilityPool: null,
    abilityAssignments: {
      strength: null,
      dexterity: null,
      constitution: null,
      intelligence: null,
      wisdom: null,
      charisma: null,
    },
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    backgroundAbilities: {},
    speciesAbilities: {},
    castingAbility: "",
    speciesSkills: [],
    speciesCantripId: "",
    speciesOriginFeatId: "",
    skillProficiencies: [],
    toolChoices: [],
    backgroundToolChoices: [],
    cantripIds: [],
    spellIds: [],
    equipmentDraft: null,
    backgroundEquipmentDraft: null,
    step: "identity",
    rulesEdition: "EDITION_2024",
    campaignId: null,
    campaignName: null,
    createdId: null,
    ...overrides,
  };
}

function makeClass(overrides: Partial<ClassOption> = {}): ClassOption {
  return {
    id: "class-1",
    name: "Bard",
    hitDie: "d8",
    savingThrows: [],
    skillChoiceCount: 0,
    skillChoices: [],
    isSpellcaster: true,
    subclassGateLevel: 3,
    subclasses: [],
    startingEquipment: null,
    multiclassPrerequisite: null,
    toolProficiencies: [],
    toolChoices: [],
    toolChoiceCount: 0,
    level1SpellPicks: null,
    primaryAbility: [],
    ...overrides,
  };
}

function makeBackground(overrides: Partial<BackgroundOption> = {}): BackgroundOption {
  return {
    id: "bg-1",
    name: "Sage",
    skillProficiencies: [],
    toolProficiencies: [],
    toolChoices: [],
    toolChoiceCount: 0,
    abilityChoices: [],
    originFeat: null,
    startingEquipment: null,
    ...overrides,
  };
}

const background = makeBackground();

function run(args: {
  draft: CharacterDraft;
  selectedClass?: ClassOption;
  selectedBackground?: BackgroundOption;
  update?: (patch: Partial<CharacterDraft>) => void;
}) {
  return renderHook(() =>
    useToolProficiencyChoices({
      draft: args.draft,
      selectedClass: args.selectedClass,
      selectedBackground: args.selectedBackground,
      update: args.update ?? vi.fn(),
    }),
  ).result.current;
}

describe("useToolProficiencyChoices", () => {
  it("dedups granted tool profs across background and class", () => {
    const result = run({
      draft: makeDraft(),
      selectedClass: makeClass({ toolProficiencies: ["Thieves' Tools"] }),
      selectedBackground: { ...background, toolProficiencies: ["Herbalism Kit", "Thieves' Tools"] },
    });
    expect(result.grantedToolProfs).toEqual(["Herbalism Kit", "Thieves' Tools"]);
  });

  it("excludes background-granted tools when using a custom background", () => {
    const result = run({
      draft: makeDraft({ useCustomBackground: true }),
      selectedClass: makeClass(),
      selectedBackground: { ...background, toolProficiencies: ["Herbalism Kit"] },
    });
    expect(result.grantedToolProfs).toEqual([]);
  });

  it("filters granted tools out of the class choosable options", () => {
    const result = run({
      draft: makeDraft(),
      selectedClass: makeClass({
        toolChoices: ["Lute", "Drum", "Flute"],
        toolChoiceCount: 2,
      }),
      selectedBackground: { ...background, toolProficiencies: ["Lute"] },
    });
    expect(result.classChoices.options).toEqual(["Drum", "Flute"]);
    expect(result.classChoices.max).toBe(2);
  });

  it("does not add a class choice past its max", () => {
    const update = vi.fn();
    const result = run({
      draft: makeDraft({ toolChoices: ["Lute", "Drum"] }),
      selectedClass: makeClass({
        toolChoices: ["Lute", "Drum", "Flute"],
        toolChoiceCount: 2,
      }),
      update,
    });
    result.classChoices.toggle("Flute");
    expect(update).not.toHaveBeenCalled();
  });

  it("removes an already-selected class choice on toggle even at the cap", () => {
    const update = vi.fn();
    const result = run({
      draft: makeDraft({ toolChoices: ["Lute", "Drum"] }),
      selectedClass: makeClass({
        toolChoices: ["Lute", "Drum", "Flute"],
        toolChoiceCount: 2,
      }),
      update,
    });
    result.classChoices.toggle("Lute");
    expect(update).toHaveBeenCalledWith({ toolChoices: ["Drum"] });
  });

  it("surfaces a background choice group independent of the class group", () => {
    const result = run({
      draft: makeDraft(),
      selectedClass: makeClass({ toolChoices: ["Lute", "Drum"], toolChoiceCount: 1 }),
      selectedBackground: makeBackground({
        toolChoices: ["Dice Set", "Playing Card Set"],
        toolChoiceCount: 1,
      }),
    });
    expect(result.backgroundChoices.options).toEqual(["Dice Set", "Playing Card Set"]);
    expect(result.backgroundChoices.max).toBe(1);
    expect(result.classChoices.options).toEqual(["Lute", "Drum"]);
    expect(result.classChoices.max).toBe(1);
  });

  it("a fixed-tool background (no toolChoices/toolChoiceCount) surfaces no background choice", () => {
    const result = run({
      draft: makeDraft(),
      selectedClass: makeClass(),
      selectedBackground: makeBackground({ toolProficiencies: ["Thieves' Tools"] }),
    });
    expect(result.backgroundChoices.options).toEqual([]);
    expect(result.backgroundChoices.max).toBe(0);
    expect(result.grantedToolProfs).toEqual(["Thieves' Tools"]);
  });

  it("does not add a background choice past its own max, independent of the class's toggle", () => {
    const update = vi.fn();
    const result = run({
      draft: makeDraft({ backgroundToolChoices: ["Dice Set"] }),
      selectedClass: makeClass({ toolChoices: ["Lute"], toolChoiceCount: 1 }),
      selectedBackground: makeBackground({
        toolChoices: ["Dice Set", "Playing Card Set"],
        toolChoiceCount: 1,
      }),
      update,
    });
    result.backgroundChoices.toggle("Playing Card Set");
    expect(update).not.toHaveBeenCalled();
  });

  it("toggling a background choice updates backgroundToolChoices, not toolChoices", () => {
    const update = vi.fn();
    const result = run({
      draft: makeDraft(),
      selectedClass: makeClass({ toolChoices: ["Lute"], toolChoiceCount: 1 }),
      selectedBackground: makeBackground({
        toolChoices: ["Dice Set", "Playing Card Set"],
        toolChoiceCount: 1,
      }),
      update,
    });
    result.backgroundChoices.toggle("Dice Set");
    expect(update).toHaveBeenCalledWith({ backgroundToolChoices: ["Dice Set"] });
  });

  it("excludes background choice options when using a custom background", () => {
    const result = run({
      draft: makeDraft({ useCustomBackground: true }),
      selectedClass: makeClass(),
      selectedBackground: makeBackground({
        toolChoices: ["Dice Set", "Playing Card Set"],
        toolChoiceCount: 1,
      }),
    });
    expect(result.backgroundChoices.options).toEqual([]);
    expect(result.backgroundChoices.max).toBe(0);
  });
});
