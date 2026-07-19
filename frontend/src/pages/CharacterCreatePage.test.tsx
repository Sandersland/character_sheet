import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import CharacterCreatePage from "@/pages/CharacterCreatePage";
import { createCharacter, fetchItems, fetchReference, fetchSpells } from "@/api/client";
import type { ReferenceData } from "@/types/character";

// Real: useCharacterDraft, useReferenceData, the ability/skill/tool DOM. Mock the
// router navigate, the API client, and BackendStatus (skips its health side-effect).

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/api/client", () => ({
  fetchReference: vi.fn(),
  fetchItems: vi.fn(),
  fetchSpells: vi.fn(),
  createCharacter: vi.fn(),
}));

vi.mock("@/features/character-meta/BackendStatus", () => ({ default: () => null }));

const mockFetchReference = vi.mocked(fetchReference);
const mockFetchItems = vi.mocked(fetchItems);
const mockFetchSpells = vi.mocked(fetchSpells);
const mockCreateCharacter = vi.mocked(createCharacter);

// A tiny Bard catalog for the creation spell picker (#1131): one cantrip + one L1.
const SPELL_CATALOG = [
  { id: "sp-mockery", name: "Vicious Mockery", level: 0, school: "enchantment", castingTime: "1 action", range: "60 ft", duration: "Instantaneous", description: "", classes: ["bard"] },
  { id: "sp-charm", name: "Charm Person", level: 1, school: "enchantment", castingTime: "1 action", range: "30 ft", duration: "1 hour", description: "", classes: ["bard"] },
];

const referenceFixture: ReferenceData = {
  races: [{ id: "race-human", name: "Human", speed: 30, toolProficiencies: [] }],
  classes: [
    {
      id: "class-bard",
      name: "Bard",
      hitDie: "d8",
      savingThrows: [],
      skillChoiceCount: 2,
      skillChoices: ["acrobatics", "arcana", "stealth"],
      isSpellcaster: true,
      subclassLevel: 3,
      subclasses: [],
      startingEquipment: null,
      multiclassPrerequisite: null,
      toolProficiencies: [],
      toolChoices: ["Lute", "Drum", "Flute"],
      toolChoiceCount: 2,
      level1SpellPicks: { cantrips: 1, spells: 1 },
    },
    {
      id: "class-fighter",
      name: "Fighter",
      hitDie: "d10",
      savingThrows: [],
      skillChoiceCount: 2,
      skillChoices: ["athletics", "acrobatics", "perception"],
      isSpellcaster: false,
      subclassLevel: 3,
      subclasses: [],
      startingEquipment: null,
      multiclassPrerequisite: null,
      toolProficiencies: [],
      toolChoices: [],
      toolChoiceCount: 0,
      level1SpellPicks: null,
    },
  ],
  backgrounds: [
    { id: "bg-sage", name: "Sage", skillProficiencies: ["history"], toolProficiencies: [] },
  ],
  alignments: ["Lawful Good"],
  artisanTools: [{ name: "Smith's Tools", category: "artisan" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockFetchReference.mockResolvedValue(referenceFixture);
  mockFetchItems.mockResolvedValue([]);
  mockFetchSpells.mockResolvedValue(SPELL_CATALOG as never);
  mockCreateCharacter.mockResolvedValue({ id: "new-1" } as never);
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/characters/new"]}>
      <CharacterCreatePage />
    </MemoryRouter>,
  );
}

describe("CharacterCreatePage (#253)", () => {
  it("builds the create payload from the form and navigates on save", async () => {
    const user = userEvent.setup();
    renderPage();

    const nameInput = await screen.findByLabelText(/name/i);
    expect(screen.getByRole("button", { name: "Save Character" })).toBeDisabled();

    await user.type(nameInput, "Alric ");
    await user.selectOptions(screen.getByLabelText(/alignment/i), "Lawful Good");
    await user.selectOptions(screen.getByLabelText(/race/i), "Human");
    await user.selectOptions(screen.getByLabelText(/class/i), "Bard");
    await user.selectOptions(screen.getByLabelText("Background"), "Sage");

    await user.click(screen.getByRole("checkbox", { name: "Acrobatics" }));
    await user.click(screen.getByRole("checkbox", { name: "Arcana" }));
    await user.click(screen.getByRole("checkbox", { name: "Lute" }));
    await user.click(screen.getByRole("checkbox", { name: "Drum" }));

    // #1131: Bard casts at level 1 — pick its one cantrip + one spell.
    await user.click(await screen.findByRole("checkbox", { name: /Vicious Mockery/ }));
    await user.click(screen.getByRole("checkbox", { name: /Charm Person/ }));

    const saveButton = screen.getByRole("button", { name: "Save Character" });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() => expect(mockCreateCharacter).toHaveBeenCalledTimes(1));
    expect(mockCreateCharacter).toHaveBeenCalledWith({
      name: "Alric",
      alignment: "Lawful Good",
      race: "Human",
      background: "Sage",
      classes: [{ name: "Bard", subclass: null, subclassId: undefined }],
      abilityScores: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      skillProficiencies: ["history", "acrobatics", "arcana"],
      toolChoices: ["Lute", "Drum"],
      portraitUrl: null,
      startingEquipment: undefined,
      spells: { cantripIds: ["sp-mockery"], spellIds: ["sp-charm"] },
    });

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/characters/new-1", { replace: true }),
    );
  });

  it("shows the Spells section for a level-1 caster (#1131)", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(await screen.findByLabelText(/class/i), "Bard");
    expect(await screen.findByRole("heading", { name: "Spells" })).toBeInTheDocument();
  });

  it("hides the Spells section for a non-caster (#1131)", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(await screen.findByLabelText(/class/i), "Fighter");
    expect(screen.queryByRole("heading", { name: "Spells" })).not.toBeInTheDocument();
  });
});
