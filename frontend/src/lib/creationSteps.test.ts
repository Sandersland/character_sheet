import { describe, it, expect } from "vitest";

import type { CreationSelections } from "@/lib/characterCreation";
import {
  CREATION_STEP_LABELS,
  creationMissing,
  creationStepMissing,
  creationSteps,
  type CreationStepKey,
} from "@/lib/creationSteps";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import type { ClassOption, ClassStartingEquipment } from "@/types/character";

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
    primaryAbility: [],
    ...overrides,
  };
}

const PACKAGE: ClassStartingEquipment = {
  groups: [{ label: "Weapon", options: [{ label: "Rapier", items: [{ catalogName: "Rapier" }] }] }],
  gold: { diceCount: 4, diceFaces: 4, multiplier: 10 },
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
    step: "identity",
    ...overrides,
  };
}

const rogue = makeClass();
const wizard = makeClass({ name: "Wizard", level1SpellPicks: { cantrips: 3, spells: 4 } });

const specBackground = {
  id: "bg-crim",
  name: "Criminal",
  skillProficiencies: ["stealth" as const],
  toolProficiencies: [],
  abilityChoices: ["dexterity" as const, "constitution" as const, "intelligence" as const],
  originFeat: null,
};

function sel(overrides: Partial<CreationSelections> = {}): CreationSelections {
  return { race: undefined, class: undefined, background: undefined, ...overrides };
}

describe("creationSteps", () => {
  it("includes the spells step only for a level-1 caster", () => {
    expect(creationSteps(sel({ class: wizard }))).toEqual([
      "identity",
      "abilities",
      "skills",
      "spells",
      "equipment",
      "review",
    ]);
  });

  it("excludes the spells step for a non-caster and when no class is chosen", () => {
    expect(creationSteps(sel({ class: rogue }))).toEqual([
      "identity",
      "abilities",
      "skills",
      "equipment",
      "review",
    ]);
    expect(creationSteps(sel())).toEqual(["identity", "abilities", "skills", "equipment", "review"]);
  });

  it("labels every step through the shared display map", () => {
    const keys: CreationStepKey[] = ["identity", "abilities", "skills", "spells", "equipment", "review"];
    expect(keys.map((k) => CREATION_STEP_LABELS[k])).toEqual([
      "Identity",
      "Abilities",
      "Skills & Tools",
      "Spells",
      "Equipment",
      "Review",
    ]);
  });
});

describe("creationStepMissing", () => {
  it("identity lists the five identity fields for an empty draft", () => {
    expect(creationStepMissing("identity", makeDraft(), sel())).toEqual([
      "Name",
      "Alignment",
      "Race",
      "Class",
      "Background",
    ]);
  });

  it("identity uses the trimmed custom background name", () => {
    const draft = makeDraft({
      name: "A",
      alignment: "Neutral Good",
      race: "Elf",
      className: "Rogue",
      useCustomBackground: true,
      customBackground: "   ",
    });
    expect(creationStepMissing("identity", draft, sel({ class: rogue }))).toEqual(["Background"]);
  });

  it("abilities gates a specced-incomplete background and clears when complete", () => {
    const incomplete = makeDraft({ background: "Criminal" });
    expect(creationStepMissing("abilities", incomplete, sel({ background: specBackground }))).toEqual([
      "Background ability scores",
    ]);

    const complete = makeDraft({ background: "Criminal", backgroundAbilities: { dexterity: 2, intelligence: 1 } });
    expect(creationStepMissing("abilities", complete, sel({ background: specBackground }))).toEqual([]);

    // Spec-less / inert background never gates abilities.
    expect(creationStepMissing("abilities", makeDraft(), sel())).toEqual([]);
  });

  it("abilities gates an unrolled roll pool", () => {
    const draft = makeDraft({ abilityMethod: "roll", abilityPool: null });
    expect(creationStepMissing("abilities", draft, sel())).toEqual(["Roll ability scores"]);
  });

  it("abilities gates an incompletely-assigned pool", () => {
    const draft = makeDraft({
      abilityMethod: "standardArray",
      abilityPool: [15, 14, 13, 12, 10, 8],
      abilityAssignments: { strength: 0, dexterity: null, constitution: null, intelligence: null, wisdom: null, charisma: null },
    });
    expect(creationStepMissing("abilities", draft, sel())).toEqual(["Assign all ability scores"]);
  });

  it("abilities clears once the pool is fully assigned", () => {
    const draft = makeDraft({
      abilityMethod: "standardArray",
      abilityPool: [15, 14, 13, 12, 10, 8],
      abilityAssignments: { strength: 0, dexterity: 1, constitution: 2, intelligence: 3, wisdom: 4, charisma: 5 },
    });
    expect(creationStepMissing("abilities", draft, sel())).toEqual([]);
  });

  it("abilities never gates manual or point-buy generation", () => {
    expect(creationStepMissing("abilities", makeDraft({ abilityMethod: "manual" }), sel())).toEqual([]);
    expect(creationStepMissing("abilities", makeDraft({ abilityMethod: "pointBuy" }), sel())).toEqual([]);
  });

  it("abilities lists both a pool gap and an incomplete background spread", () => {
    const draft = makeDraft({ background: "Criminal", abilityMethod: "roll", abilityPool: null });
    expect(creationStepMissing("abilities", draft, sel({ background: specBackground }))).toEqual([
      "Roll ability scores",
      "Background ability scores",
    ]);
  });

  it("skills and review are always empty", () => {
    expect(creationStepMissing("skills", makeDraft(), sel({ class: rogue }))).toEqual([]);
    expect(creationStepMissing("review", makeDraft(), sel({ class: rogue }))).toEqual([]);
  });

  it("spells gates an incomplete caster's picks", () => {
    const draft = makeDraft({ className: "Wizard", cantripIds: ["c1"], spellIds: [] });
    expect(creationStepMissing("spells", draft, sel({ class: wizard }))).toEqual([
      "Cantrips: choose 3",
      "Spells: choose 4",
    ]);
  });

  it("equipment gates a started-but-incomplete package", () => {
    const started = makeDraft({
      className: "Rogue",
      equipmentDraft: { mode: "package", selections: [{ optionIndex: -1 }] },
    });
    expect(creationStepMissing("equipment", started, sel({ class: makeClass({ startingEquipment: PACKAGE }) }))).toEqual(
      ['Equipment: choose "Weapon"'],
    );

    // Untouched (null) draft starts with no inventory — nothing gated.
    const untouched = makeDraft({ className: "Rogue" });
    expect(
      creationStepMissing("equipment", untouched, sel({ class: makeClass({ startingEquipment: PACKAGE }) })),
    ).toEqual([]);
  });
});

describe("aggregate matches creationMissing", () => {
  function aggregate(draft: CharacterDraft, selections: CreationSelections): string[] {
    return creationSteps(selections).flatMap((k) => creationStepMissing(k, draft, selections));
  }

  it("empty draft with no class", () => {
    const draft = makeDraft();
    expect(aggregate(draft, sel())).toEqual(creationMissing(draft, sel()));
  });

  it("incomplete caster with a specced background", () => {
    const draft = makeDraft({ name: "Mo", className: "Wizard", background: "Criminal", cantripIds: ["c1"] });
    const selections = sel({ class: wizard, background: specBackground });
    expect(aggregate(draft, selections)).toEqual(creationMissing(draft, selections));
  });
  it("unassigned pool draft surfaces the abilities gate", () => {
    const draft = makeDraft({ name: "Mo", className: "Rogue", abilityMethod: "roll", abilityPool: null });
    const selections = sel({ class: rogue });
    const missing = creationMissing(draft, selections);
    expect(missing).toContain("Roll ability scores");
    expect(aggregate(draft, selections)).toEqual(missing);
  });
});

describe("creationMissing", () => {
  it("lists all unmet requirements for an empty draft", () => {
    expect(creationMissing(makeDraft(), sel())).toEqual(["Name", "Alignment", "Race", "Class", "Background"]);
  });

  it("is empty for a complete draft with a spec-less background", () => {
    const draft = makeDraft({ name: "Lidda", alignment: "Neutral Good", race: "Elf", className: "Rogue", background: "Sage" });
    expect(creationMissing(draft, sel({ class: rogue }))).toEqual([]);
  });

  it("blocks save until a specced background's spread is complete (#1130)", () => {
    const draft = makeDraft({ name: "Lidda", alignment: "Neutral Good", race: "Elf", className: "Rogue", background: "Criminal" });
    const selections = sel({ class: rogue, background: specBackground });
    expect(creationMissing(draft, selections)).toContain("Background ability scores");

    const assigned = makeDraft({ ...draft, backgroundAbilities: { dexterity: 2, constitution: 1 } });
    expect(creationMissing(assigned, selections)).not.toContain("Background ability scores");
  });

  it("blocks an incomplete caster's spell picks and passes a complete one (#1131)", () => {
    const caster = { name: "Mo", alignment: "Neutral Good", race: "Elf", className: "Wizard", background: "Sage" };
    const incomplete = makeDraft({ ...caster, cantripIds: ["c1"], spellIds: [] });
    expect(creationMissing(incomplete, sel({ class: wizard }))).toEqual(["Cantrips: choose 3", "Spells: choose 4"]);

    const complete = makeDraft({ ...caster, cantripIds: ["c1", "c2", "c3"], spellIds: ["s1", "s2", "s3", "s4"] });
    expect(creationMissing(complete, sel({ class: wizard }))).toEqual([]);
  });

  it("never blocks a non-caster on spells (#1131)", () => {
    const draft = makeDraft({ name: "F", alignment: "Neutral Good", race: "Elf", className: "Rogue", background: "Sage" });
    expect(creationMissing(draft, sel({ class: rogue }))).toEqual([]);
  });
});
