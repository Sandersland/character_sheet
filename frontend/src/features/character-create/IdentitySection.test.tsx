import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import IdentitySection from "@/features/character-create/IdentitySection";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import type { ReferenceData } from "@/types/character";

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

// A variant-bearing species (2014 Dwarf-shaped: Hill/Mountain) alongside a
// variantless one (2014 Human-shaped) — the two shapes #1680's picker must
// tell apart.
const reference: ReferenceData = {
  species: [
    {
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
    },
    {
      id: "sp-human", name: "Human", slug: "human", speed: 30, abilityIncreases: [],
      needsCastingAbility: false, chooseSkills: null, chooseCantrip: null, chooseOriginFeat: false, variants: [],
    },
    // #1683: a 2024 Elf-shaped species with a spell-granting lineage (Drow)
    // and a non-spell-granting one (Wood Elf), for the casting-ability picker.
    {
      id: "sp-elf-2024",
      name: "Elf",
      slug: "elf",
      speed: 30,
      abilityIncreases: [],
      needsCastingAbility: false,
      chooseSkills: null,
      chooseCantrip: null,
      chooseOriginFeat: false,
      variants: [
        {
          id: "var-drow", name: "Drow", slug: "drow", abilityIncreases: [], abilityIncreasesReplace: false,
          needsCastingAbility: true, chooseSkills: null, chooseCantrip: null, chooseOriginFeat: false,
        },
        {
          id: "var-wood", name: "Wood Elf", slug: "wood", abilityIncreases: [], abilityIncreasesReplace: false,
          needsCastingAbility: false, chooseSkills: null, chooseCantrip: null, chooseOriginFeat: false,
        },
      ],
    },
    // #1756: a 2014 Elf-shaped species whose Astral Elf variant opens the
    // casting-ability choice (chooseCantrip with no fixed ability →
    // needsCastingAbility:true) while High Elf fixes it (needsCastingAbility:false).
    {
      id: "sp-elf-2014",
      name: "Elf (2014)",
      slug: "elf-2014",
      speed: 30,
      abilityIncreases: [],
      needsCastingAbility: false,
      chooseSkills: null,
      chooseCantrip: null,
      chooseOriginFeat: false,
      variants: [
        {
          id: "var-astral", name: "Astral Elf", slug: "astral", abilityIncreases: [],
          needsCastingAbility: true, chooseSkills: null,
          chooseCantrip: { spells: ["Dancing Lights", "Light", "Sacred Flame"] }, chooseOriginFeat: false,
        },
        {
          id: "var-high", name: "High Elf", slug: "high", abilityIncreases: [],
          needsCastingAbility: false, chooseSkills: null,
          chooseCantrip: { list: "wizard", castingAbility: "intelligence" }, chooseOriginFeat: false,
        },
      ],
    },
  ],
  classes: [],
  backgrounds: [],
  alignments: ["Lawful Good"],
  artisanTools: [],
  conditions: [],
  universalActions: [],
  itemRarities: [],
};

function renderSection(draft: CharacterDraft, update = vi.fn()) {
  render(
    <IdentitySection
      draft={draft}
      update={update}
      reference={reference}
      portraitFile={null}
      onPortraitChange={vi.fn()}
    />,
  );
  return update;
}

describe("IdentitySection — two-step species/variant picker (#1680)", () => {
  it("renders no Variant panel before a species is chosen", () => {
    renderSection(makeDraft());
    expect(screen.getByLabelText(/^Species/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Variant/)).not.toBeInTheDocument();
  });

  it("renders the Variant panel for a variant-bearing species", () => {
    renderSection(makeDraft({ speciesId: "sp-dwarf" }));
    const variantSelect = screen.getByLabelText(/^Variant/);
    expect(variantSelect).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Hill Dwarf" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Mountain Dwarf" })).toBeInTheDocument();
  });

  it("renders no Variant panel for a variantless species", () => {
    renderSection(makeDraft({ speciesId: "sp-human" }));
    expect(screen.queryByLabelText(/^Variant/)).not.toBeInTheDocument();
  });

  it("picking a species resets any stale variant selection (and castingAbility, #1683)", async () => {
    const u = userEvent.setup();
    const update = renderSection(makeDraft({ speciesId: "sp-dwarf", variantId: "var-hill" }));

    await u.selectOptions(screen.getByLabelText(/^Species/), "Human");

    expect(update).toHaveBeenCalledWith({ speciesId: "sp-human", variantId: "", castingAbility: "" });
  });

  it("picking a variant updates variantId (and resets castingAbility, #1683)", async () => {
    const u = userEvent.setup();
    const update = renderSection(makeDraft({ speciesId: "sp-dwarf" }));

    await u.selectOptions(screen.getByLabelText(/^Variant/), "Hill Dwarf");

    expect(update).toHaveBeenCalledWith({ variantId: "var-hill", castingAbility: "" });
  });
});

// #1683: the casting-ability picker (Int/Wis/Cha), rendered only for a
// spell-granting lineage/legacy (SpeciesVariantOption.needsCastingAbility).
describe("IdentitySection — casting-ability picker (#1683)", () => {
  it("renders no picker before a species is chosen", () => {
    renderSection(makeDraft());
    expect(screen.queryByRole("group", { name: /casting ability/i })).not.toBeInTheDocument();
  });

  it("renders no picker for a non-spell-granting variant (Wood Elf)", () => {
    renderSection(makeDraft({ speciesId: "sp-elf-2024", variantId: "var-wood" }));
    expect(screen.queryByRole("group", { name: /casting ability/i })).not.toBeInTheDocument();
  });

  it("renders the picker for a 2014 Astral Elf (open-ability chooseCantrip, #1756)", () => {
    renderSection(makeDraft({ speciesId: "sp-elf-2014", variantId: "var-astral" }));
    expect(screen.getByRole("group", { name: /casting ability/i })).toBeInTheDocument();
  });

  it("renders no picker for a 2014 High Elf (its cantrip ability is fixed, #1756)", () => {
    renderSection(makeDraft({ speciesId: "sp-elf-2014", variantId: "var-high" }));
    expect(screen.queryByRole("group", { name: /casting ability/i })).not.toBeInTheDocument();
  });

  it("renders the picker for a spell-granting variant (Drow)", () => {
    renderSection(makeDraft({ speciesId: "sp-elf-2024", variantId: "var-drow" }));
    const group = screen.getByRole("group", { name: /casting ability/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Intelligence" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wisdom" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Charisma" })).toBeInTheDocument();
  });

  it("picking an ability updates castingAbility", async () => {
    const u = userEvent.setup();
    const update = renderSection(makeDraft({ speciesId: "sp-elf-2024", variantId: "var-drow" }));

    await u.click(screen.getByRole("button", { name: "Charisma" }));

    expect(update).toHaveBeenCalledWith({ castingAbility: "charisma" });
  });

  it("marks the chosen ability pressed", () => {
    renderSection(makeDraft({ speciesId: "sp-elf-2024", variantId: "var-drow", castingAbility: "wisdom" }));
    expect(screen.getByRole("button", { name: "Wisdom" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Charisma" })).toHaveAttribute("aria-pressed", "false");
  });

  it("changing species resets a stale castingAbility choice", async () => {
    const u = userEvent.setup();
    const update = renderSection(
      makeDraft({ speciesId: "sp-elf-2024", variantId: "var-drow", castingAbility: "charisma" }),
    );

    await u.selectOptions(screen.getByLabelText(/^Species/), "Dwarf");

    expect(update).toHaveBeenCalledWith({ speciesId: "sp-dwarf", variantId: "", castingAbility: "" });
  });

  it("changing variant resets a stale castingAbility choice", async () => {
    const u = userEvent.setup();
    const update = renderSection(
      makeDraft({ speciesId: "sp-elf-2024", variantId: "var-drow", castingAbility: "charisma" }),
    );

    await u.selectOptions(screen.getByLabelText(/^Variant/), "Wood Elf");

    expect(update).toHaveBeenCalledWith({ variantId: "var-wood", castingAbility: "" });
  });
});
