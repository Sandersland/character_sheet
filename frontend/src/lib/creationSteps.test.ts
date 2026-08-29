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
import type { ClassOption, ClassStartingEquipment, SpeciesOption } from "@/types/character";

function makeClass(overrides: Partial<ClassOption> = {}): ClassOption {
  return {
    id: "class-1",
    name: "Rogue",
    hitDie: "d8",
    savingThrows: [],
    skillChoiceCount: 2,
    skillChoices: ["acrobatics", "stealth", "perception"],
    isSpellcaster: false,
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

const PACKAGE: ClassStartingEquipment = {
  groups: [{ label: "Weapon", options: [{ label: "Rapier", items: [{ catalogName: "Rapier" }] }] }],
  gold: { diceCount: 4, diceFaces: 4, multiplier: 10 },
};

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

const rogue = makeClass();
// spellbookSize marks the Wizard's split — its 6-spell spellbook (spells) differs from its 4-spell prepared cap (never served on ClassOption).
const wizard = makeClass({
  name: "Wizard",
  level1SpellPicks: { cantrips: 3, spells: 6, maxSpellLevel: 1, spellbookSize: 6 },
});
// A 2014 Ranger is spellcasting-flagged but has no Spellcasting feature until level 2, so level1SpellPicks is null for a different reason than a genuine non-caster.
const ranger2014 = makeClass({ name: "Ranger", isSpellcaster: true, level1SpellPicks: null });
// A 2014 Cleric/Druid-shaped class is cantrips-only — SRD 5.1 offers no creation-time leveled-spell list.
const cleric2014 = makeClass({
  name: "Cleric",
  isSpellcaster: true,
  level1SpellPicks: { cantrips: 3, spells: 0, maxSpellLevel: 0 },
});

const specBackground = {
  id: "bg-crim",
  name: "Criminal",
  skillProficiencies: ["stealth" as const],
  toolProficiencies: [],
  toolChoices: [],
  toolChoiceCount: 0,
  abilityChoices: ["dexterity" as const, "constitution" as const, "intelligence" as const],
  originFeat: null,
  startingEquipment: null,
};

const elfSpecies: SpeciesOption = {
  id: "sp-elf",
  name: "Elf",
  slug: "elf",
  speed: 30,
  abilityIncreases: [],
  needsCastingAbility: false,
  chooseSkills: null,
  chooseCantrip: null, chooseOriginFeat: false,
  variants: [],
};
const dwarfSpecies: SpeciesOption = {
  id: "sp-dwarf",
  name: "Dwarf",
  slug: "dwarf",
  speed: 25,
  abilityIncreases: [],
  needsCastingAbility: false,
  chooseSkills: null,
  chooseCantrip: null, chooseOriginFeat: false,
  variants: [
    {
      id: "var-hill", name: "Hill Dwarf", slug: "hill", abilityIncreases: [], abilityIncreasesReplace: false,
      needsCastingAbility: false, chooseSkills: null, chooseCantrip: null, chooseOriginFeat: false,
    },
    {
      id: "var-mountain", name: "Mountain Dwarf", slug: "mountain", abilityIncreases: [], abilityIncreasesReplace: false,
      needsCastingAbility: false, chooseSkills: null, chooseCantrip: null, chooseOriginFeat: false,
    },
  ],
};

function sel(overrides: Partial<CreationSelections> = {}): CreationSelections {
  return { species: undefined, variant: undefined, class: undefined, background: undefined, ...overrides };
}

const drowLineageElf: SpeciesOption = {
  id: "sp-elf-2024",
  name: "Elf",
  slug: "elf",
  speed: 30,
  abilityIncreases: [],
  needsCastingAbility: false,
  chooseSkills: null,
  chooseCantrip: null,
  chooseOriginFeat: false,
  variants: [{
    id: "var-drow", name: "Drow", slug: "drow", abilityIncreases: [], abilityIncreasesReplace: false,
    needsCastingAbility: true, chooseSkills: null, chooseCantrip: null, chooseOriginFeat: false,
  }],
};

// A fixed-only species never gates the abilities step (per deriveSpeciesBonuses.complete) — this fixture's choose-2-of-5 spread does.
const halfElfSpecies: SpeciesOption = {
  id: "sp-half-elf",
  name: "Half-Elf",
  slug: "half-elf",
  speed: 30,
  abilityIncreases: [
    { ability: "charisma", amount: 2 },
    { choose: { count: 2, amount: 1, from: ["strength", "dexterity", "constitution", "intelligence", "wisdom"] } },
  ],
  needsCastingAbility: false,
  chooseSkills: { count: 2 },
  chooseCantrip: null, chooseOriginFeat: false,
  variants: [],
};

const astralElfSpecies: SpeciesOption = {
  id: "sp-elf-astral",
  name: "Elf",
  slug: "elf",
  speed: 30,
  abilityIncreases: [{ ability: "dexterity", amount: 2 }],
  needsCastingAbility: false,
  chooseSkills: null,
  chooseCantrip: null,
  chooseOriginFeat: false,
  variants: [
    {
      id: "var-astral", name: "Astral Elf", slug: "astral",
      abilityIncreases: [{ floating: 3 }],
      abilityIncreasesReplace: true,
      needsCastingAbility: false, chooseSkills: null, chooseCantrip: null, chooseOriginFeat: false,
    },
  ],
};

const highElfSpecies: SpeciesOption = {
  id: "sp-elf2",
  name: "Elf",
  slug: "elf",
  speed: 30,
  abilityIncreases: [],
  needsCastingAbility: false,
  chooseSkills: null,
  chooseCantrip: null, chooseOriginFeat: false,
  variants: [
    {
      id: "var-high",
      name: "High Elf",
      slug: "high",
      abilityIncreases: [],
      abilityIncreasesReplace: false,
      needsCastingAbility: false,
      chooseSkills: null,
      chooseCantrip: { list: "wizard", castingAbility: "intelligence" },
      chooseOriginFeat: false,
    },
    {
      id: "var-astral",
      name: "Astral Elf",
      slug: "astral",
      abilityIncreases: [],
      abilityIncreasesReplace: true,
      needsCastingAbility: true,
      chooseSkills: null,
      chooseCantrip: { spells: ["Dancing Lights", "Light", "Sacred Flame"] },
      chooseOriginFeat: false,
    },
  ],
};
const highElfVariant = highElfSpecies.variants[0];
const astralElfVariant = highElfSpecies.variants[1];

const humanSpecies2024: SpeciesOption = {
  id: "sp-human2024",
  name: "Human",
  slug: "human",
  speed: 30,
  abilityIncreases: [],
  needsCastingAbility: false,
  chooseSkills: { count: 1 },
  chooseCantrip: null,
  chooseOriginFeat: true,
  variants: [],
};

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

  it("excludes the spells step for a 2014 Ranger (level1SpellPicks: null pre-level-2)", () => {
    expect(creationSteps(sel({ class: ranger2014 }))).toEqual([
      "identity",
      "abilities",
      "skills",
      "equipment",
      "review",
    ]);
  });

  it("includes the spells step for a non-caster class when the species serves a chooseCantrip spec", () => {
    expect(creationSteps(sel({ class: rogue, species: highElfSpecies, variant: highElfVariant }))).toEqual([
      "identity",
      "abilities",
      "skills",
      "spells",
      "equipment",
      "review",
    ]);
  });

  it("still excludes the spells step for a non-caster with no species cantrip choice (a plain Elf, no variant)", () => {
    expect(creationSteps(sel({ class: rogue, species: highElfSpecies }))).toEqual([
      "identity",
      "abilities",
      "skills",
      "equipment",
      "review",
    ]);
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
      "Species",
      "Class",
      "Background",
    ]);
  });

  it("identity uses the trimmed custom background name", () => {
    const draft = makeDraft({
      name: "A",
      alignment: "Neutral Good",
      speciesId: "sp-elf",
      className: "Rogue",
      useCustomBackground: true,
      customBackground: "   ",
    });
    expect(creationStepMissing("identity", draft, sel({ class: rogue, species: elfSpecies }))).toEqual(["Background"]);
  });

  it("identity blocks a variant-bearing species with no variant, and clears once one is chosen", () => {
    const draft = makeDraft({
      name: "A",
      alignment: "Neutral Good",
      speciesId: "sp-dwarf",
      className: "Rogue",
      background: "Sage",
    });
    expect(creationStepMissing("identity", draft, sel({ class: rogue, species: dwarfSpecies }))).toEqual(["Variant"]);

    const withVariant = makeDraft({ ...draft, variantId: "var-hill" });
    expect(
      creationStepMissing(
        "identity",
        withVariant,
        sel({ class: rogue, species: dwarfSpecies, variant: dwarfSpecies.variants[0] }),
      ),
    ).toEqual([]);
  });

  it("identity never gates a variantless species on a variant", () => {
    const draft = makeDraft({
      name: "A",
      alignment: "Neutral Good",
      speciesId: "sp-elf",
      className: "Rogue",
      background: "Sage",
    });
    expect(creationStepMissing("identity", draft, sel({ class: rogue, species: elfSpecies }))).toEqual([]);
  });

  it("identity blocks a spell-granting variant with no castingAbility, and clears once one is chosen", () => {
    const draft = makeDraft({
      name: "A",
      alignment: "Neutral Good",
      speciesId: "sp-elf-2024",
      variantId: "var-drow",
      className: "Rogue",
      background: "Sage",
    });
    const selection = sel({ class: rogue, species: drowLineageElf, variant: drowLineageElf.variants[0] });
    expect(creationStepMissing("identity", draft, selection)).toEqual(["Casting ability"]);

    const withChoice = makeDraft({ ...draft, castingAbility: "charisma" });
    expect(creationStepMissing("identity", withChoice, selection)).toEqual([]);
  });

  it("identity blocks an Astral Elf draft with no castingAbility, and clears once one is chosen", () => {
    const draft = makeDraft({
      name: "A",
      alignment: "Neutral Good",
      speciesId: "sp-elf2",
      variantId: "var-astral",
      className: "Rogue",
      background: "Sage",
    });
    const selection = sel({ class: rogue, species: highElfSpecies, variant: astralElfVariant });
    expect(creationStepMissing("identity", draft, selection)).toEqual(["Casting ability"]);

    const withChoice = makeDraft({ ...draft, castingAbility: "wisdom" });
    expect(creationStepMissing("identity", withChoice, selection)).toEqual([]);
  });

  it("identity never gates a non-spell-granting variant on a casting ability", () => {
    const draft = makeDraft({
      name: "A",
      alignment: "Neutral Good",
      speciesId: "sp-dwarf",
      variantId: "var-hill",
      className: "Rogue",
      background: "Sage",
    });
    expect(
      creationStepMissing("identity", draft, sel({ class: rogue, species: dwarfSpecies, variant: dwarfSpecies.variants[0] })),
    ).toEqual([]);
  });

  it("abilities gates a specced-incomplete background and clears when complete", () => {
    const incomplete = makeDraft({ background: "Criminal" });
    expect(creationStepMissing("abilities", incomplete, sel({ background: specBackground }))).toEqual([
      "Background ability scores",
    ]);

    const complete = makeDraft({ background: "Criminal", backgroundAbilities: { dexterity: 2, intelligence: 1 } });
    expect(creationStepMissing("abilities", complete, sel({ background: specBackground }))).toEqual([]);

    expect(creationStepMissing("abilities", makeDraft(), sel())).toEqual([]);
  });

  it("abilities gates a choose-bearing species and clears when complete (#1681)", () => {
    const incomplete = makeDraft({ speciesId: "sp-half-elf" });
    expect(creationStepMissing("abilities", incomplete, sel({ species: halfElfSpecies }))).toEqual([
      "Species ability scores",
    ]);

    const complete = makeDraft({ speciesId: "sp-half-elf", speciesAbilities: { strength: 1, dexterity: 1 } });
    expect(creationStepMissing("abilities", complete, sel({ species: halfElfSpecies }))).toEqual([]);

    expect(creationStepMissing("abilities", makeDraft(), sel())).toEqual([]);
  });

  it("abilities gates an Astral Elf floating spread until validly assigned (#1758)", () => {
    const selection = sel({ species: astralElfSpecies, variant: astralElfSpecies.variants[0] });
    const unassigned = makeDraft({ speciesId: "sp-elf-astral", variantId: "var-astral" });
    expect(creationStepMissing("abilities", unassigned, selection)).toEqual(["Species ability scores"]);

    const illegal = makeDraft({ speciesId: "sp-elf-astral", variantId: "var-astral", speciesAbilities: { dexterity: 1, wisdom: 1 } });
    expect(creationStepMissing("abilities", illegal, selection)).toEqual(["Species ability scores"]);

    const assigned = makeDraft({ speciesId: "sp-elf-astral", variantId: "var-astral", speciesAbilities: { dexterity: 2, wisdom: 1 } });
    expect(creationStepMissing("abilities", assigned, selection)).toEqual([]);
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

  it("skills and review are empty with no species skill choice in play", () => {
    expect(creationStepMissing("skills", makeDraft(), sel({ class: rogue }))).toEqual([]);
    expect(creationStepMissing("review", makeDraft(), sel({ class: rogue }))).toEqual([]);
  });

  it("skills gates an incomplete species skill choice (Half-Elf) and clears once satisfied", () => {
    const incomplete = makeDraft({ className: "Rogue", speciesId: "sp-half-elf", speciesSkills: ["stealth"] });
    expect(creationStepMissing("skills", incomplete, sel({ class: rogue, species: halfElfSpecies }))).toEqual([
      "Species skills",
    ]);
    const complete = makeDraft({ className: "Rogue", speciesId: "sp-half-elf", speciesSkills: ["stealth", "perception"] });
    expect(creationStepMissing("skills", complete, sel({ class: rogue, species: halfElfSpecies }))).toEqual([]);
  });

  it("skills gates an incomplete species Origin feat choice (2024 Human) and clears once satisfied", () => {
    const incomplete = makeDraft({ className: "Rogue", speciesId: "sp-human2024", speciesSkills: ["stealth"] });
    expect(creationStepMissing("skills", incomplete, sel({ class: rogue, species: humanSpecies2024 }))).toEqual([
      "Species origin feat",
    ]);
    const complete = makeDraft({
      className: "Rogue",
      speciesId: "sp-human2024",
      speciesSkills: ["stealth"],
      speciesOriginFeatId: "feat-tough",
    });
    expect(creationStepMissing("skills", complete, sel({ class: rogue, species: humanSpecies2024 }))).toEqual([]);
  });

  it("spells gates an incomplete caster's picks", () => {
    const draft = makeDraft({ className: "Wizard", cantripIds: ["c1"], spellIds: [] });
    expect(creationStepMissing("spells", draft, sel({ class: wizard }))).toEqual([
      "Cantrips: choose 3",
      "Spells: choose 6",
    ]);
  });

  it("spells clears with 3 cantrips and no spells for a 2014 Cleric/Druid-shaped class", () => {
    const draft = makeDraft({ className: "Cleric", cantripIds: ["c1", "c2", "c3"], spellIds: [] });
    expect(creationStepMissing("spells", draft, sel({ class: cleric2014 }))).toEqual([]);
  });

  it("spells gates an incomplete species cantrip choice (High Elf) for a non-caster class", () => {
    const missing = makeDraft({ className: "Rogue", speciesId: "sp-elf2", variantId: "var-high" });
    expect(creationStepMissing("spells", missing, sel({ class: rogue, species: highElfSpecies, variant: highElfVariant }))).toEqual([
      "Species cantrip",
    ]);
    const complete = makeDraft({ className: "Rogue", speciesId: "sp-elf2", variantId: "var-high", speciesCantripId: "spell-fire-bolt" });
    expect(creationStepMissing("spells", complete, sel({ class: rogue, species: highElfSpecies, variant: highElfVariant }))).toEqual([]);
  });

  it("spells gates an incomplete species cantrip choice (Astral Elf) until one is picked", () => {
    const missing = makeDraft({ className: "Rogue", speciesId: "sp-elf2", variantId: "var-astral" });
    expect(creationStepMissing("spells", missing, sel({ class: rogue, species: highElfSpecies, variant: astralElfVariant }))).toEqual([
      "Species cantrip",
    ]);
    const complete = makeDraft({ className: "Rogue", speciesId: "sp-elf2", variantId: "var-astral", speciesCantripId: "spell-light" });
    expect(creationStepMissing("spells", complete, sel({ class: rogue, species: highElfSpecies, variant: astralElfVariant }))).toEqual([]);
  });

  it("equipment gates a started-but-incomplete package", () => {
    const started = makeDraft({
      className: "Rogue",
      equipmentDraft: { mode: "package", selections: [{ optionIndex: -1 }] },
    });
    expect(creationStepMissing("equipment", started, sel({ class: makeClass({ startingEquipment: PACKAGE }) }))).toEqual(
      ['Equipment: choose "Weapon"'],
    );

    const untouched = makeDraft({ className: "Rogue" });
    expect(
      creationStepMissing("equipment", untouched, sel({ class: makeClass({ startingEquipment: PACKAGE }) })),
    ).toEqual([]);
  });

  it("equipment also gates a started-but-incomplete BACKGROUND package", () => {
    const started = makeDraft({
      className: "Rogue",
      background: "Criminal",
      backgroundEquipmentDraft: { mode: "package", selections: [{ optionIndex: -1 }] },
    });
    const backgroundWithPackage = { ...specBackground, startingEquipment: PACKAGE };
    expect(
      creationStepMissing("equipment", started, sel({ class: rogue, background: backgroundWithPackage })),
    ).toEqual(['Background equipment: choose "Weapon"']);

    const untouched = makeDraft({ className: "Rogue", background: "Criminal" });
    expect(
      creationStepMissing("equipment", untouched, sel({ class: rogue, background: backgroundWithPackage })),
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
    expect(creationMissing(makeDraft(), sel())).toEqual(["Name", "Alignment", "Species", "Class", "Background"]);
  });

  it("is empty for a complete draft with a spec-less background", () => {
    const draft = makeDraft({ name: "Lidda", alignment: "Neutral Good", speciesId: "sp-elf", className: "Rogue", background: "Sage" });
    expect(creationMissing(draft, sel({ class: rogue, species: elfSpecies }))).toEqual([]);
  });

  it("blocks save until a specced background's spread is complete (#1130)", () => {
    const draft = makeDraft({ name: "Lidda", alignment: "Neutral Good", speciesId: "sp-elf", className: "Rogue", background: "Criminal" });
    const selections = sel({ class: rogue, background: specBackground, species: elfSpecies });
    expect(creationMissing(draft, selections)).toContain("Background ability scores");

    const assigned = makeDraft({ ...draft, backgroundAbilities: { dexterity: 2, constitution: 1 } });
    expect(creationMissing(assigned, selections)).not.toContain("Background ability scores");
  });

  it("blocks an incomplete caster's spell picks and passes a complete one (#1131)", () => {
    const caster = { name: "Mo", alignment: "Neutral Good", speciesId: "sp-elf", className: "Wizard", background: "Sage" };
    const incomplete = makeDraft({ ...caster, cantripIds: ["c1"], spellIds: [] });
    expect(creationMissing(incomplete, sel({ class: wizard, species: elfSpecies }))).toEqual(["Cantrips: choose 3", "Spells: choose 6"]);

    const complete = makeDraft({
      ...caster,
      cantripIds: ["c1", "c2", "c3"],
      spellIds: ["s1", "s2", "s3", "s4", "s5", "s6"],
    });
    expect(creationMissing(complete, sel({ class: wizard, species: elfSpecies }))).toEqual([]);
  });

  it("never blocks a non-caster on spells (#1131)", () => {
    const draft = makeDraft({ name: "F", alignment: "Neutral Good", speciesId: "sp-elf", className: "Rogue", background: "Sage" });
    expect(creationMissing(draft, sel({ class: rogue, species: elfSpecies }))).toEqual([]);
  });
});
