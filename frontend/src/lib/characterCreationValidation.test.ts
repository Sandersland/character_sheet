import { describe, expect, it } from "vitest";

import {
  isOpenPickUnfilled,
  missingRequirements,
} from "./characterCreationValidation";
import type { EquipmentDraft } from "./startingEquipment";
import type { ClassStartingEquipment } from "@/types/character";

const VALID_IDENTITY = {
  name: "Aria",
  alignment: "Chaotic Good",
  speciesChosen: true,
  variantRequired: false,
  variantChosen: false,
  className: "Fighter",
  backgroundName: "Soldier",
};

// A two-group package: group 0 has a martial-weapon open pick, group 1 is a
// simple either/or with no nested pick.
const startingEquipment: ClassStartingEquipment = {
  groups: [
    {
      label: "Primary weapon",
      options: [
        {
          label: "a martial weapon",
          openPicks: [{ label: "any martial weapon", filter: { weaponClass: "martial" } }],
        },
        { label: "two handaxes", items: [{ catalogName: "Handaxe", quantity: 2 }] },
      ],
    },
    {
      label: "Secondary",
      options: [
        { label: "a shield", items: [{ catalogName: "Shield" }] },
        { label: "a second martial weapon", items: [{ catalogName: "Longsword" }] },
      ],
    },
  ],
  gold: { diceCount: 5, diceFaces: 4, multiplier: 10 },
};

describe("missingRequirements", () => {
  it("returns an empty list when every identity field is filled and no equipment draft", () => {
    expect(
      missingRequirements({
        ...VALID_IDENTITY,
        startingEquipment: null,
        equipmentDraft: null,
      })
    ).toEqual([]);
  });

  it("lists each unmet identity field by display label", () => {
    const result = missingRequirements({
      name: "  ",
      alignment: "",
      speciesChosen: false,
      variantRequired: false,
      variantChosen: false,
      className: "",
      backgroundName: "",
      startingEquipment: null,
      equipmentDraft: null,
    });
    expect(result).toEqual([
      "Name",
      "Alignment",
      "Species",
      "Class",
      "Background",
    ]);
  });

  // #1680: a variant-bearing species (2014 Dwarf) cannot Continue without a
  // variant — mirrors the subclass-required pattern (an id-presence gate).
  it("flags a missing variant only when the species requires one", () => {
    expect(
      missingRequirements({
        ...VALID_IDENTITY,
        variantRequired: true,
        variantChosen: false,
        startingEquipment: null,
        equipmentDraft: null,
      })
    ).toEqual(["Variant"]);

    expect(
      missingRequirements({
        ...VALID_IDENTITY,
        variantRequired: true,
        variantChosen: true,
        startingEquipment: null,
        equipmentDraft: null,
      })
    ).toEqual([]);

    // Variantless species (2014 Human) — no Variant label even though none is chosen.
    expect(
      missingRequirements({
        ...VALID_IDENTITY,
        variantRequired: false,
        variantChosen: false,
        startingEquipment: null,
        equipmentDraft: null,
      })
    ).toEqual([]);
  });

  it("never flags Variant when no species is chosen at all — Species is the blocker", () => {
    const result = missingRequirements({
      ...VALID_IDENTITY,
      speciesChosen: false,
      variantRequired: true,
      variantChosen: false,
      startingEquipment: null,
      equipmentDraft: null,
    });
    expect(result).toEqual(["Species"]);
  });

  it("ignores an untouched equipment draft (null) — character starts with no inventory", () => {
    expect(
      missingRequirements({
        ...VALID_IDENTITY,
        startingEquipment,
        equipmentDraft: null,
      })
    ).toEqual([]);
  });

  it("flags an unpicked equipment group by its label", () => {
    const draft: EquipmentDraft = {
      mode: "package",
      selections: [
        { optionIndex: -1, openPicks: [] },
        { optionIndex: 0, openPicks: [] },
      ],
    };
    const result = missingRequirements({
      ...VALID_IDENTITY,
      startingEquipment,
      equipmentDraft: draft,
    });
    expect(result).toEqual(['Equipment: choose "Primary weapon"']);
  });

  it("flags a nested martial-weapon sub-choice that is still on — choose —", () => {
    const draft: EquipmentDraft = {
      mode: "package",
      selections: [
        // Option 0 chosen but its open pick is still empty.
        { optionIndex: 0, openPicks: [""] },
        { optionIndex: 0, openPicks: [] },
      ],
    };
    const result = missingRequirements({
      ...VALID_IDENTITY,
      startingEquipment,
      equipmentDraft: draft,
    });
    expect(result).toEqual(['Equipment: pick "any martial weapon"']);
  });

  it("passes once the nested sub-choice is filled", () => {
    const draft: EquipmentDraft = {
      mode: "package",
      selections: [
        { optionIndex: 0, openPicks: ["Longsword"] },
        { optionIndex: 0, openPicks: [] },
      ],
    };
    expect(
      missingRequirements({
        ...VALID_IDENTITY,
        startingEquipment,
        equipmentDraft: draft,
      })
    ).toEqual([]);
  });

  it("flags a gold amount outside the class range", () => {
    expect(
      missingRequirements({
        ...VALID_IDENTITY,
        startingEquipment,
        equipmentDraft: { mode: "gold", gold: 5 },
      })
    ).toEqual(["Starting gold amount"]);
  });
});

// #1565: the background's OWN package, same completeness rule as the class
// equipment block above but on the two backgroundStartingEquipment/
// backgroundEquipmentDraft fields, with a distinct "Background equipment:"
// label prefix so the two never collide.
describe("missingRequirements — background equipment (#1565)", () => {
  const backgroundEquipment: ClassStartingEquipment = {
    groups: [
      {
        label: "Starting Equipment",
        options: [
          { label: "(A) 16 GP", gold: 16 },
          { label: "(B) 50 GP", gold: 50 },
        ],
      },
    ],
    gold: null,
  };

  it("ignores an untouched background equipment draft (null)", () => {
    expect(
      missingRequirements({
        ...VALID_IDENTITY,
        startingEquipment: null,
        equipmentDraft: null,
        backgroundStartingEquipment: backgroundEquipment,
        backgroundEquipmentDraft: null,
      })
    ).toEqual([]);
  });

  it("flags an unpicked background equipment group, distinctly from the class one", () => {
    const draft: EquipmentDraft = { mode: "package", selections: [{ optionIndex: -1, openPicks: [] }] };
    const result = missingRequirements({
      ...VALID_IDENTITY,
      startingEquipment: null,
      equipmentDraft: null,
      backgroundStartingEquipment: backgroundEquipment,
      backgroundEquipmentDraft: draft,
    });
    expect(result).toEqual(['Background equipment: choose "Starting Equipment"']);
  });

  it("passes once the background package is complete, alongside an ALSO-incomplete class package (both flagged independently)", () => {
    const classDraft: EquipmentDraft = {
      mode: "package",
      selections: [{ optionIndex: -1, openPicks: [] }, { optionIndex: 0, openPicks: [] }],
    };
    const backgroundDraft: EquipmentDraft = { mode: "package", selections: [{ optionIndex: 0, openPicks: [] }] };
    const result = missingRequirements({
      ...VALID_IDENTITY,
      startingEquipment,
      equipmentDraft: classDraft,
      backgroundStartingEquipment: backgroundEquipment,
      backgroundEquipmentDraft: backgroundDraft,
    });
    // Only the CLASS group is incomplete — the background one (complete) adds nothing.
    expect(result).toEqual(['Equipment: choose "Primary weapon"']);
  });
});

describe("isOpenPickUnfilled", () => {
  it("is true when the parent option is selected but the pick is empty", () => {
    const draft: EquipmentDraft = {
      mode: "package",
      selections: [{ optionIndex: 0, openPicks: [""] }],
    };
    expect(isOpenPickUnfilled(draft, 0, 0)).toBe(true);
  });

  it("is false once the pick has a value", () => {
    const draft: EquipmentDraft = {
      mode: "package",
      selections: [{ optionIndex: 0, openPicks: ["Longsword"] }],
    };
    expect(isOpenPickUnfilled(draft, 0, 0)).toBe(false);
  });

  it("is false when no option is selected for the group", () => {
    const draft: EquipmentDraft = {
      mode: "package",
      selections: [{ optionIndex: -1, openPicks: [] }],
    };
    expect(isOpenPickUnfilled(draft, 0, 0)).toBe(false);
  });

  it("is false for a null or gold-mode draft", () => {
    expect(isOpenPickUnfilled(null, 0, 0)).toBe(false);
    expect(isOpenPickUnfilled({ mode: "gold", gold: 100 }, 0, 0)).toBe(false);
  });
});
