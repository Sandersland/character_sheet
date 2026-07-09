import { describe, it, expect } from "vitest";

import {
  buildCreatePayload,
  creationMissing,
  derivePreview,
  deriveSkillChoices,
  resolveBackgroundName,
  resolveEquipmentInput,
  resolveSelections,
} from "@/lib/characterCreation";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import type { ClassOption, ReferenceData } from "@/types/character";

function makeClass(overrides: Partial<ClassOption> = {}): ClassOption {
  return {
    id: "class-1",
    name: "Rogue",
    hitDie: "d8",
    savingThrows: [],
    skillChoiceCount: 2,
    skillChoices: ["acrobatics", "stealth", "perception"],
    isSpellcaster: false,
    subclassLevel: 3,
    subclasses: [],
    startingEquipment: null,
    multiclassPrerequisite: null,
    toolProficiencies: [],
    toolChoices: [],
    toolChoiceCount: 0,
    ...overrides,
  };
}

const reference: ReferenceData = {
  races: [{ id: "race-1", name: "Elf", speed: 30, toolProficiencies: [] }],
  classes: [makeClass()],
  backgrounds: [
    { id: "bg-1", name: "Sage", skillProficiencies: ["perception"], toolProficiencies: [] },
  ],
  alignments: ["Neutral Good"],
  artisanTools: [],
};

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
    equipmentDraft: null,
    ...overrides,
  };
}

describe("resolveSelections", () => {
  it("matches by name and returns undefined for a null reference", () => {
    const draft = makeDraft({ race: "Elf", className: "Rogue", background: "Sage" });
    expect(resolveSelections(reference, draft).class?.name).toBe("Rogue");
    expect(resolveSelections(null, draft)).toEqual({
      race: undefined,
      class: undefined,
      background: undefined,
    });
  });
});

describe("deriveSkillChoices", () => {
  it("excludes background-granted skills from class options", () => {
    const draft = makeDraft({ className: "Rogue", background: "Sage" });
    const result = deriveSkillChoices(draft, resolveSelections(reference, draft));
    expect(result.granted).toEqual(["perception"]);
    expect(result.options).toEqual(["acrobatics", "stealth"]);
    expect(result.max).toBe(2);
  });

  it("drops granted skills when a custom background is used", () => {
    const draft = makeDraft({ className: "Rogue", background: "Sage", useCustomBackground: true });
    const result = deriveSkillChoices(draft, resolveSelections(reference, draft));
    expect(result.granted).toEqual([]);
    expect(result.options).toContain("perception");
  });

  it("keeps only currently-valid selected skills", () => {
    const draft = makeDraft({
      className: "Rogue",
      background: "Sage",
      skillProficiencies: ["stealth", "perception"], // perception is granted, not a choice
    });
    const result = deriveSkillChoices(draft, resolveSelections(reference, draft));
    expect(result.selected).toEqual(["stealth"]);
  });
});

describe("resolveBackgroundName", () => {
  it("trims the custom name when custom is on", () => {
    expect(resolveBackgroundName(makeDraft({ useCustomBackground: true, customBackground: "  Hermit " }))).toBe("Hermit");
  });
  it("uses the list pick otherwise", () => {
    expect(resolveBackgroundName(makeDraft({ background: "Sage" }))).toBe("Sage");
  });
});

describe("resolveEquipmentInput", () => {
  it("is undefined when the draft is untouched", () => {
    const draft = makeDraft({ className: "Rogue" });
    expect(resolveEquipmentInput(draft, resolveSelections(reference, draft).class)).toBeUndefined();
  });
});

describe("derivePreview", () => {
  it("computes AC, speed, and max HP from scores and hit die", () => {
    const draft = makeDraft({
      race: "Elf",
      className: "Rogue",
      abilityScores: {
        strength: 10,
        dexterity: 16,
        constitution: 14,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
    });
    const preview = derivePreview(draft, resolveSelections(reference, draft));
    expect(preview.armorClass).toBe(13);
    expect(preview.dexModifier).toBe(3);
    expect(preview.speed).toBe(30);
    expect(preview.maxHp).toBe(10);
  });

  it("leaves speed and maxHp undefined without race/class", () => {
    const draft = makeDraft({});
    const preview = derivePreview(draft, resolveSelections(reference, draft));
    expect(preview.speed).toBeUndefined();
    expect(preview.maxHp).toBeUndefined();
  });
});

describe("creationMissing", () => {
  it("lists all unmet requirements for an empty draft", () => {
    const draft = makeDraft({});
    expect(creationMissing(draft, resolveSelections(reference, draft))).toEqual([
      "Name",
      "Alignment",
      "Race",
      "Class",
      "Background",
    ]);
  });

  it("is empty for a complete draft", () => {
    const draft = makeDraft({
      name: "Lidda",
      alignment: "Neutral Good",
      race: "Elf",
      className: "Rogue",
      background: "Sage",
    });
    expect(creationMissing(draft, resolveSelections(reference, draft))).toEqual([]);
  });
});

describe("buildCreatePayload", () => {
  it("merges granted + selected skills and omits empty optionals", () => {
    const draft = makeDraft({
      name: " Lidda ",
      alignment: "Neutral Good",
      race: "Elf",
      className: "Rogue",
      background: "Sage",
      skillProficiencies: ["stealth"],
    });
    const selections = resolveSelections(reference, draft);
    const skills = deriveSkillChoices(draft, selections);
    const payload = buildCreatePayload(draft, selections, skills, []);
    expect(payload.name).toBe("Lidda");
    expect(payload.classes).toEqual([{ name: "Rogue", subclass: null, subclassId: undefined }]);
    expect(payload.skillProficiencies).toEqual(["perception", "stealth"]);
    expect(payload.toolChoices).toBeUndefined();
    expect(payload.portraitUrl).toBeNull();
    expect(payload.startingEquipment).toBeUndefined();
  });

  it("passes through non-empty tool choices", () => {
    const draft = makeDraft({ name: "X", className: "Rogue" });
    const selections = resolveSelections(reference, draft);
    const skills = deriveSkillChoices(draft, selections);
    const payload = buildCreatePayload(draft, selections, skills, ["Thieves' Tools"]);
    expect(payload.toolChoices).toEqual(["Thieves' Tools"]);
  });
});
