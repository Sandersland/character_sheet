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
    speciesSkills: [],
    speciesCantripId: "",
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
  races: [],
  species: [
    {
      id: "sp-dwarf",
      name: "Dwarf",
      slug: "dwarf",
      speed: 25,
      abilityIncreases: [],
      chooseSkills: null,
      chooseCantrip: null,
      variants: [
        { id: "var-hill", name: "Hill Dwarf", slug: "hill", abilityIncreases: [], chooseSkills: null, chooseCantrip: null },
        { id: "var-mountain", name: "Mountain Dwarf", slug: "mountain", abilityIncreases: [], chooseSkills: null, chooseCantrip: null },
      ],
    },
    { id: "sp-human", name: "Human", slug: "human", speed: 30, abilityIncreases: [], chooseSkills: null, chooseCantrip: null, variants: [] },
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

  it("picking a species resets any stale variant selection", async () => {
    const u = userEvent.setup();
    const update = renderSection(makeDraft({ speciesId: "sp-dwarf", variantId: "var-hill" }));

    await u.selectOptions(screen.getByLabelText(/^Species/), "Human");

    expect(update).toHaveBeenCalledWith({ speciesId: "sp-human", variantId: "" });
  });

  it("picking a variant updates variantId alone", async () => {
    const u = userEvent.setup();
    const update = renderSection(makeDraft({ speciesId: "sp-dwarf" }));

    await u.selectOptions(screen.getByLabelText(/^Variant/), "Hill Dwarf");

    expect(update).toHaveBeenCalledWith({ variantId: "var-hill" });
  });
});
