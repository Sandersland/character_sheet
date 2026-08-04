import { describe, it, expect } from "vitest";

import {
  buildCreatePayload,
  deriveBackgroundBonuses,
  derivePreview,
  deriveSkillChoices,
  deriveSpeciesBonuses,
  resolveBackgroundEquipmentInput,
  resolveBackgroundName,
  resolveEquipmentInput,
  resolveSelections,
} from "@/lib/characterCreation";
import { emptyPackageState } from "@/lib/startingEquipment";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import type { ClassOption, ClassStartingEquipment, ReferenceData, SpeciesOption } from "@/types/character";

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

// #1565: a real (multi-option) background package, used by
// resolveBackgroundEquipmentInput/buildCreatePayload tests below — shaped
// like Criminal's real SRD 5.2 package (a choice group, two lettered
// options).
const CRIMINAL_PACKAGE: ClassStartingEquipment = {
  groups: [
    {
      label: "Starting Equipment",
      options: [
        { label: "(A) 2 Daggers and 16 GP", items: [{ catalogName: "Dagger", quantity: 2 }], gold: 16 },
        { label: "(B) 50 GP", gold: 50 },
      ],
    },
  ],
  gold: null,
};

// #1680: a flat Race row sharing the species' name — kept only to exercise
// resolveSelections' compat `race` lookup (useToolProficiencyChoices' dormant
// race-granted-tool-profs source), never the picker's own source of truth.
const reference: ReferenceData = {
  races: [{ id: "race-1", name: "Elf", speed: 30, toolProficiencies: [] }],
  species: [{ id: "sp-elf", name: "Elf", slug: "elf", speed: 30, abilityIncreases: [], variants: [] }],
  classes: [makeClass()],
  backgrounds: [
    { id: "bg-1", name: "Sage", skillProficiencies: ["perception"], toolProficiencies: [], abilityChoices: [], originFeat: null, startingEquipment: null },
    {
      id: "bg-crim",
      name: "Criminal",
      skillProficiencies: ["stealth"],
      toolProficiencies: ["Thieves' Tools"],
      abilityChoices: ["dexterity", "constitution", "intelligence"],
      originFeat: { id: "feat-alert", name: "Alert", description: "Bonus to initiative.", category: "origin" },
      startingEquipment: CRIMINAL_PACKAGE,
    },
  ],
  alignments: ["Neutral Good"],
  artisanTools: [],
  conditions: [],
  universalActions: [],
  itemRarities: [],
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
    skillProficiencies: [],
    toolChoices: [],
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

describe("resolveSelections", () => {
  it("matches species/variant by id and class/background by name; returns undefined for a null reference", () => {
    const draft = makeDraft({ speciesId: "sp-elf", className: "Rogue", background: "Sage" });
    const resolved = resolveSelections(reference, draft);
    expect(resolved.class?.name).toBe("Rogue");
    expect(resolved.species?.name).toBe("Elf");
    // #1680: the legacy `race` compat lookup resolves by the species' NAME.
    expect(resolved.race?.name).toBe("Elf");
    expect(resolveSelections(null, draft)).toEqual({
      species: undefined,
      variant: undefined,
      race: undefined,
      class: undefined,
      background: undefined,
    });
  });

  it("resolves the variant by id, scoped to its own species", () => {
    const referenceWithVariants: ReferenceData = {
      ...reference,
      species: [
        {
          id: "sp-dwarf",
          name: "Dwarf",
          slug: "dwarf",
          speed: 25,
          abilityIncreases: [],
          variants: [{ id: "var-hill", name: "Hill Dwarf", slug: "hill", abilityIncreases: [] }],
        },
      ],
    };
    const draft = makeDraft({ speciesId: "sp-dwarf", variantId: "var-hill" });
    expect(resolveSelections(referenceWithVariants, draft).variant?.name).toBe("Hill Dwarf");
  });
});

// #1679/#1681: SpeciesOption fixtures — a variant-bearing species (Dwarf-shape:
// species-level fixed +2 CON, variant-level fixed +1 WIS) and a choose-bearing
// one (Half-Elf-shape: fixed +2 CHA + choose 2 of {str,dex,con,int,wis} at +1).
const DWARF_SPECIES: SpeciesOption = {
  id: "sp-dwarf",
  name: "Dwarf",
  slug: "dwarf",
  speed: 25,
  abilityIncreases: [{ ability: "constitution", amount: 2 }],
  variants: [
    { id: "var-hill", name: "Hill Dwarf", slug: "hill", abilityIncreases: [{ ability: "wisdom", amount: 1 }] },
  ],
};
const HALF_ELF_SPECIES: SpeciesOption = {
  id: "sp-half-elf",
  name: "Half-Elf",
  slug: "half-elf",
  speed: 30,
  abilityIncreases: [
    { ability: "charisma", amount: 2 },
    { choose: { count: 2, amount: 1, from: ["strength", "dexterity", "constitution", "intelligence", "wisdom"] } },
  ],
  variants: [],
};
const speciesReference: ReferenceData = { ...reference, species: [DWARF_SPECIES, HALF_ELF_SPECIES] };

describe("deriveSpeciesBonuses (#1681)", () => {
  it("is inert (applicable:false) when no species is selected", () => {
    const draft = makeDraft();
    const bonuses = deriveSpeciesBonuses(draft, resolveSelections(speciesReference, draft));
    expect(bonuses).toEqual({ applicable: false, fixed: {}, choice: null, assignment: {}, complete: true });
  });

  it("a fixed-only species+variant merges both levels' increases and is always complete", () => {
    const draft = makeDraft({ speciesId: "sp-dwarf", variantId: "var-hill" });
    const bonuses = deriveSpeciesBonuses(draft, resolveSelections(speciesReference, draft));
    expect(bonuses.applicable).toBe(true);
    expect(bonuses.fixed).toEqual({ constitution: 2, wisdom: 1 });
    expect(bonuses.choice).toBeNull();
    expect(bonuses.complete).toBe(true);
  });

  it("a choose-bearing species excludes the fixed ability from the eligible list and starts incomplete", () => {
    const draft = makeDraft({ speciesId: "sp-half-elf" });
    const bonuses = deriveSpeciesBonuses(draft, resolveSelections(speciesReference, draft));
    expect(bonuses.fixed).toEqual({ charisma: 2 });
    expect(bonuses.choice).toEqual({
      count: 2,
      amount: 1,
      abilities: ["strength", "dexterity", "constitution", "intelligence", "wisdom"],
    });
    expect(bonuses.complete).toBe(false);
  });

  it("is complete once exactly `count` abilities are assigned at `amount` each", () => {
    const draft = makeDraft({ speciesId: "sp-half-elf", speciesAbilities: { strength: 1, dexterity: 1 } });
    const bonuses = deriveSpeciesBonuses(draft, resolveSelections(speciesReference, draft));
    expect(bonuses.assignment).toEqual({ strength: 1, dexterity: 1 });
    expect(bonuses.complete).toBe(true);
  });

  it("ignores a stale draft.speciesAbilities entry outside the eligible list (e.g. left over from a prior species)", () => {
    const draft = makeDraft({ speciesId: "sp-half-elf", speciesAbilities: { charisma: 1, strength: 1 } });
    const bonuses = deriveSpeciesBonuses(draft, resolveSelections(speciesReference, draft));
    expect(bonuses.assignment).toEqual({ strength: 1 });
    expect(bonuses.complete).toBe(false);
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

// #1565's twin of resolveEquipmentInput's own tests above, for the
// background's OWN package.
describe("resolveBackgroundEquipmentInput", () => {
  it("is undefined when the background equipment draft is untouched (null)", () => {
    const draft = makeDraft({ background: "Criminal" });
    expect(resolveBackgroundEquipmentInput(draft, resolveSelections(reference, draft).background)).toBeUndefined();
  });

  it("is undefined for a background with no package (startingEquipment null), even with a draft set", () => {
    const draft = makeDraft({
      background: "Sage",
      backgroundEquipmentDraft: { mode: "package", selections: [{ optionIndex: 0 }] },
    });
    expect(resolveBackgroundEquipmentInput(draft, resolveSelections(reference, draft).background)).toBeUndefined();
  });

  it("resolves a complete package draft into the wire PackageSelection shape", () => {
    const draft = makeDraft({
      background: "Criminal",
      backgroundEquipmentDraft: { mode: "package", selections: [{ optionIndex: 0, openPicks: [] }] },
    });
    const input = resolveBackgroundEquipmentInput(draft, resolveSelections(reference, draft).background);
    expect(input).toEqual({ mode: "package", selections: [{ optionIndex: 0, openPicks: [] }] });
  });

  it("emptyPackageState leaves a multi-option group unselected (-1), incomplete until the player picks", () => {
    expect(emptyPackageState(CRIMINAL_PACKAGE)).toEqual([{ optionIndex: -1, openPicks: [] }]);
  });
});

describe("derivePreview", () => {
  it("computes AC, speed, and max HP from scores and hit die", () => {
    const draft = makeDraft({
      speciesId: "sp-elf",
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
      speciesId: "sp-elf",
      className: "Rogue",
      background: "Criminal",
      backgroundAbilities: { constitution: 2, dexterity: 1 }, // CON 10→12 (+1), DEX 10→11 (+0)
    });
    const preview = derivePreview(draft, resolveSelections(reference, draft));
    // Rogue d8 (8) + CON mod +1 = 9.
    expect(preview.maxHp).toBe(9);
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

  it("sends speciesId/variantId and a completed speciesAbilities choice (#1681)", () => {
    const draft = makeDraft({ name: "X", className: "Rogue", speciesId: "sp-half-elf", speciesAbilities: { strength: 1, dexterity: 1 } });
    const selections = resolveSelections(speciesReference, draft);
    const payload = buildCreatePayload(draft, selections, deriveSkillChoices(draft, selections), []);
    expect(payload.speciesId).toBe("sp-half-elf");
    expect(payload.variantId).toBeUndefined();
    expect(payload.speciesAbilities).toEqual({ strength: 1, dexterity: 1 });
  });

  it("omits speciesAbilities for a fixed-only species and for an incomplete choice", () => {
    const fixedOnly = makeDraft({ name: "X", className: "Rogue", speciesId: "sp-dwarf", variantId: "var-hill" });
    const sel1 = resolveSelections(speciesReference, fixedOnly);
    const payload1 = buildCreatePayload(fixedOnly, sel1, deriveSkillChoices(fixedOnly, sel1), []);
    expect(payload1.speciesId).toBe("sp-dwarf");
    expect(payload1.variantId).toBe("var-hill");
    expect(payload1.speciesAbilities).toBeUndefined();

    const incompleteChoice = makeDraft({ name: "X", className: "Rogue", speciesId: "sp-half-elf", speciesAbilities: { strength: 1 } });
    const sel2 = resolveSelections(speciesReference, incompleteChoice);
    expect(buildCreatePayload(incompleteChoice, sel2, deriveSkillChoices(incompleteChoice, sel2), []).speciesAbilities).toBeUndefined();
  });

  it("omits speciesId/variantId when the draft's own empty-string default is untouched (`|| undefined` normalization)", () => {
    const draft = makeDraft({ name: "X", className: "Rogue" });
    const selections = resolveSelections(speciesReference, draft);
    const payload = buildCreatePayload(draft, selections, deriveSkillChoices(draft, selections), []);
    expect(payload.speciesId).toBeUndefined();
    expect(payload.variantId).toBeUndefined();
  });

  it("merges granted + selected skills and omits empty optionals", () => {
    const draft = makeDraft({
      name: " Lidda ",
      alignment: "Neutral Good",
      speciesId: "sp-elf",
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
    // #1616: portraits are uploaded blobs — the create payload never carries a URL.
    expect("portraitUrl" in payload).toBe(false);
    expect(payload.startingEquipment).toBeUndefined();
    expect(payload.backgroundStartingEquipment).toBeUndefined();
  });

  // #1680: the two-step picker's real selection rides speciesId/variantId
  // (ids, like subclassId); `race` is resolved compat text, not a second pick.
  it("sends speciesId/variantId and derives the legacy race string from the chosen name", () => {
    const variantReference: ReferenceData = {
      ...reference,
      species: [
        {
          id: "sp-dwarf",
          name: "Dwarf",
          slug: "dwarf",
          speed: 25,
          abilityIncreases: [],
          variants: [{ id: "var-hill", name: "Hill Dwarf", slug: "hill", abilityIncreases: [] }],
        },
      ],
    };
    const draft = makeDraft({
      name: "Borin",
      className: "Rogue",
      background: "Sage",
      speciesId: "sp-dwarf",
      variantId: "var-hill",
    });
    const selections = resolveSelections(variantReference, draft);
    const skills = deriveSkillChoices(draft, selections);
    const payload = buildCreatePayload(draft, selections, skills, []);
    expect(payload.speciesId).toBe("sp-dwarf");
    expect(payload.variantId).toBe("var-hill");
    expect(payload.race).toBe("Hill Dwarf");
  });

  // A variantless species' payload race falls back to the species' own name,
  // and variantId is omitted (never an empty string) — mirrors subclassId's
  // "" → undefined shape.
  it("omits variantId and uses the species name for a variantless species", () => {
    const draft = makeDraft({ name: "Alric", className: "Rogue", background: "Sage", speciesId: "sp-elf" });
    const selections = resolveSelections(reference, draft);
    const skills = deriveSkillChoices(draft, selections);
    const payload = buildCreatePayload(draft, selections, skills, []);
    expect(payload.speciesId).toBe("sp-elf");
    expect(payload.variantId).toBeUndefined();
    expect(payload.race).toBe("Elf");
  });

  it("passes through non-empty tool choices", () => {
    const draft = makeDraft({ name: "X", className: "Rogue" });
    const selections = resolveSelections(reference, draft);
    const skills = deriveSkillChoices(draft, selections);
    const payload = buildCreatePayload(draft, selections, skills, ["Thieves' Tools"]);
    expect(payload.toolChoices).toEqual(["Thieves' Tools"]);
  });

  // #1565: the background's own package selections ride a SEPARATE field,
  // never merged into (or overwriting) `startingEquipment` (the class's).
  it("includes backgroundStartingEquipment alongside a class package, never merged into one field", () => {
    const draft = makeDraft({
      name: "X",
      className: "Rogue",
      background: "Criminal",
      backgroundEquipmentDraft: { mode: "package", selections: [{ optionIndex: 0, openPicks: [] }] },
    });
    const selections = resolveSelections(reference, draft);
    const skills = deriveSkillChoices(draft, selections);
    const payload = buildCreatePayload(draft, selections, skills, []);
    expect(payload.startingEquipment).toBeUndefined();
    expect(payload.backgroundStartingEquipment).toEqual({
      mode: "package",
      selections: [{ optionIndex: 0, openPicks: [] }],
    });
  });
});

describe("creation spells (#1131)", () => {
  // #1513: spellbookSize marks the Wizard's spellbook (6) as distinct from its
  // prepared cap (4, never served on ClassOption) — buildCreatePayload just
  // passes the draft's picks through, so this fixture change is documentation,
  // not a behavior assertion (see creationSpells.test.ts / creationSteps.test.ts
  // for the count-cap assertions).
  const caster = makeClass({
    name: "Wizard",
    level1SpellPicks: { cantrips: 3, spells: 6, maxSpellLevel: 1, spellbookSize: 6 },
  });
  const casterSelections = {
    species: undefined,
    variant: undefined,
    race: undefined,
    class: caster,
    background: undefined,
  };

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
