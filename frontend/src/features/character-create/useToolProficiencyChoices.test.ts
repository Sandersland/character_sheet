import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useToolProficiencyChoices } from "@/features/character-create/useToolProficiencyChoices";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import type { BackgroundOption, ClassOption, RaceOption } from "@/types/character";

function makeDraft(overrides: Partial<CharacterDraft> = {}): CharacterDraft {
  return {
    name: "",
    alignment: "",
    race: "",
    className: "",
    subclass: "",
    subclassId: "",
    portraitUrl: "",
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
    skillProficiencies: [],
    toolChoices: [],
    cantripIds: [],
    spellIds: [],
    equipmentDraft: null,
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
    subclassLevel: 3,
    subclasses: [],
    startingEquipment: null,
    multiclassPrerequisite: null,
    toolProficiencies: [],
    toolChoices: [],
    toolChoiceCount: 0,
    level1SpellPicks: null,
    ...overrides,
  };
}

const race: RaceOption = { id: "race-1", name: "Human", speed: 30, toolProficiencies: [] };
const background: BackgroundOption = {
  id: "bg-1",
  name: "Sage",
  skillProficiencies: [],
  toolProficiencies: [],
};

function run(args: {
  draft: CharacterDraft;
  selectedClass?: ClassOption;
  selectedRace?: RaceOption;
  selectedBackground?: BackgroundOption;
  update?: (patch: Partial<CharacterDraft>) => void;
}) {
  return renderHook(() =>
    useToolProficiencyChoices({
      draft: args.draft,
      selectedClass: args.selectedClass,
      selectedRace: args.selectedRace,
      selectedBackground: args.selectedBackground,
      update: args.update ?? vi.fn(),
    }),
  ).result.current;
}

describe("useToolProficiencyChoices", () => {
  it("dedups granted tool profs across background, class, and race", () => {
    const result = run({
      draft: makeDraft(),
      selectedClass: makeClass({ toolProficiencies: ["Thieves' Tools"] }),
      selectedRace: { ...race, toolProficiencies: ["Thieves' Tools"] },
      selectedBackground: { ...background, toolProficiencies: ["Herbalism Kit"] },
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

  it("filters granted tools out of the choosable options", () => {
    const result = run({
      draft: makeDraft(),
      selectedClass: makeClass({
        toolChoices: ["Lute", "Drum", "Flute"],
        toolChoiceCount: 2,
      }),
      selectedBackground: { ...background, toolProficiencies: ["Lute"] },
    });
    expect(result.toolChoiceOptions).toEqual(["Drum", "Flute"]);
    expect(result.maxToolChoices).toBe(2);
  });

  it("does not add a choice past maxToolChoices", () => {
    const update = vi.fn();
    const result = run({
      draft: makeDraft({ toolChoices: ["Lute", "Drum"] }),
      selectedClass: makeClass({
        toolChoices: ["Lute", "Drum", "Flute"],
        toolChoiceCount: 2,
      }),
      update,
    });
    result.toggleToolChoice("Flute");
    expect(update).not.toHaveBeenCalled();
  });

  it("removes an already-selected choice on toggle even at the cap", () => {
    const update = vi.fn();
    const result = run({
      draft: makeDraft({ toolChoices: ["Lute", "Drum"] }),
      selectedClass: makeClass({
        toolChoices: ["Lute", "Drum", "Flute"],
        toolChoiceCount: 2,
      }),
      update,
    });
    result.toggleToolChoice("Lute");
    expect(update).toHaveBeenCalledWith({ toolChoices: ["Drum"] });
  });
});
