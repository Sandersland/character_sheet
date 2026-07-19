import { describe, it, expect } from "vitest";

import {
  buildCreatePayload,
  creationMissing,
  deriveBackgroundBonuses,
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
    level1SpellPicks: null,
    ...overrides,
  };
}

const reference: ReferenceData = {
  races: [{ id: "race-1", name: "Elf", speed: 30, toolProficiencies: [] }],
  classes: [makeClass()],
  backgrounds: [
    { id: "bg-1", name: "Sage", skillProficiencies: ["perception"], toolProficiencies: [], abilityChoices: [], originFeat: null },
    {
      id: "bg-crim",
      name: "Criminal",
      skillProficiencies: ["stealth"],
      toolProficiencies: ["Thieves' Tools"],
      abilityChoices: ["dexterity", "constitution", "intelligence"],
      originFeat: { id: "feat-alert", name: "Alert", description: "Bonus to initiative.", category: "origin" },
    },
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
    backgroundAbilities: {},
    skillProficiencies: [],
    toolChoices: [],
    cantripIds: [],
    spellIds: [],
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

describe("deriveBackgroundBonuses (#1130)", () => {
  it("is inert for a custom background", () => {
    const draft = makeDraft({ background: "Criminal", useCustomBackground: true });
    const bonuses = deriveBackgroundBonuses(draft, resolveSelections(reference, draft));
    expect(bonuses.applicable).toBe(false);
    expect(bonuses.abilities).toEqual([]);
    expect(bonuses.originFeat).toBeNull();
  });

  it("is inert for a spec-less (legacy) background", () => {
    const draft = makeDraft({ background: "Sage" });
    const bonuses = deriveBackgroundBonuses(draft, resolveSelections(reference, draft));
    expect(bonuses.applicable).toBe(false);
  });

  it("surfaces the three abilities + origin feat for a specced background", () => {
    const draft = makeDraft({ background: "Criminal" });
    const bonuses = deriveBackgroundBonuses(draft, resolveSelections(reference, draft));
    expect(bonuses.applicable).toBe(true);
    expect(bonuses.abilities).toEqual(["dexterity", "constitution", "intelligence"]);
    expect(bonuses.originFeat?.name).toBe("Alert");
    expect(bonuses.complete).toBe(false); // nothing assigned yet
  });

  it("is complete for a valid +2/+1 and incomplete for an illegal shape", () => {
    const valid = makeDraft({ background: "Criminal", backgroundAbilities: { dexterity: 2, intelligence: 1 } });
    expect(deriveBackgroundBonuses(valid, resolveSelections(reference, valid)).complete).toBe(true);

    const oneOneOne = makeDraft({ background: "Criminal", backgroundAbilities: { dexterity: 1, constitution: 1, intelligence: 1 } });
    expect(deriveBackgroundBonuses(oneOneOne, resolveSelections(reference, oneOneOne)).complete).toBe(true);

    const bad = makeDraft({ background: "Criminal", backgroundAbilities: { dexterity: 2, constitution: 2 } });
    expect(deriveBackgroundBonuses(bad, resolveSelections(reference, bad)).complete).toBe(false);
  });

  it("ignores bumps on abilities outside the background's three", () => {
    const draft = makeDraft({ background: "Criminal", backgroundAbilities: { strength: 2, dexterity: 1 } });
    const bonuses = deriveBackgroundBonuses(draft, resolveSelections(reference, draft));
    expect(bonuses.assignment).toEqual({ dexterity: 1 });
    expect(bonuses.complete).toBe(false);
  });
});

describe("derivePreview with background bonuses", () => {
  it("folds the spread into the effective HP/AC preview", () => {
    const draft = makeDraft({
      race: "Elf",
      className: "Rogue",
      background: "Criminal",
      backgroundAbilities: { constitution: 2, dexterity: 1 }, // CON 10→12 (+1), DEX 10→11 (+0)
    });
    const preview = derivePreview(draft, resolveSelections(reference, draft));
    // Rogue d8 (8) + CON mod +1 = 9.
    expect(preview.maxHp).toBe(9);
  });
});

describe("creationMissing with background bonuses", () => {
  it("blocks save until a specced background's spread is complete", () => {
    const draft = makeDraft({
      name: "Lidda",
      alignment: "Neutral Good",
      race: "Elf",
      className: "Rogue",
      background: "Criminal",
    });
    expect(creationMissing(draft, resolveSelections(reference, draft))).toContain("Background ability scores");

    const assigned = makeDraft({ ...draft, backgroundAbilities: { dexterity: 2, constitution: 1 } });
    expect(creationMissing(assigned, resolveSelections(reference, assigned))).not.toContain("Background ability scores");
  });

  it("does not list the spread for a spec-less background", () => {
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
  it("sends backgroundAbilities only when the spread is complete", () => {
    const draft = makeDraft({ name: "X", className: "Rogue", background: "Criminal", backgroundAbilities: { dexterity: 2, intelligence: 1 } });
    const selections = resolveSelections(reference, draft);
    const payload = buildCreatePayload(draft, selections, deriveSkillChoices(draft, selections), []);
    expect(payload.backgroundAbilities).toEqual({ dexterity: 2, intelligence: 1 });
  });

  it("omits backgroundAbilities when incomplete or inert", () => {
    const incomplete = makeDraft({ name: "X", className: "Rogue", background: "Criminal", backgroundAbilities: { dexterity: 2 } });
    const sel1 = resolveSelections(reference, incomplete);
    expect(buildCreatePayload(incomplete, sel1, deriveSkillChoices(incomplete, sel1), []).backgroundAbilities).toBeUndefined();

    const inert = makeDraft({ name: "X", className: "Rogue", background: "Sage" });
    const sel2 = resolveSelections(reference, inert);
    expect(buildCreatePayload(inert, sel2, deriveSkillChoices(inert, sel2), []).backgroundAbilities).toBeUndefined();
  });

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

describe("creation spells (#1131)", () => {
  const caster = makeClass({ name: "Wizard", level1SpellPicks: { cantrips: 3, spells: 4 } });
  const casterSelections = { race: undefined, class: caster, background: undefined };
  const completeCaster = {
    name: "Mo", alignment: "Neutral Good", race: "Elf", className: "Wizard", background: "Sage",
  };

  it("creationMissing blocks an incomplete caster's spell picks", () => {
    const draft = makeDraft({ ...completeCaster, cantripIds: ["c1"], spellIds: [] });
    expect(creationMissing(draft, casterSelections)).toEqual(["Cantrips: choose 3", "Spells: choose 4"]);
  });

  it("creationMissing passes a complete caster", () => {
    const draft = makeDraft({ ...completeCaster, cantripIds: ["c1", "c2", "c3"], spellIds: ["s1", "s2", "s3", "s4"] });
    expect(creationMissing(draft, casterSelections)).toEqual([]);
  });

  it("creationMissing never blocks a non-caster on spells", () => {
    const draft = makeDraft({ name: "F", alignment: "Neutral Good", race: "Elf", className: "Rogue", background: "Sage" });
    expect(creationMissing(draft, resolveSelections(reference, draft))).toEqual([]);
  });

  it("buildCreatePayload includes spells for a caster", () => {
    const draft = makeDraft({ name: "Mo", className: "Wizard", cantripIds: ["c1"], spellIds: ["s1"] });
    const skills = deriveSkillChoices(draft, casterSelections);
    const payload = buildCreatePayload(draft, casterSelections, skills, []);
    expect(payload.spells).toEqual({ cantripIds: ["c1"], spellIds: ["s1"] });
  });

  it("buildCreatePayload omits spells for a non-caster", () => {
    const draft = makeDraft({ name: "F", className: "Rogue" });
    const selections = resolveSelections(reference, draft);
    const skills = deriveSkillChoices(draft, selections);
    const payload = buildCreatePayload(draft, selections, skills, []);
    expect(payload.spells).toBeUndefined();
  });
});
