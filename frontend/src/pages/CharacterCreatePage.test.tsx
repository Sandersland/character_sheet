import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import CharacterCreatePage from "@/pages/CharacterCreatePage";
import { createCharacter, fetchItems, fetchReference } from "@/api/client";
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
  createCharacter: vi.fn(),
}));

vi.mock("@/features/character-meta/BackendStatus", () => ({ default: () => null }));

const mockFetchReference = vi.mocked(fetchReference);
const mockFetchItems = vi.mocked(fetchItems);
const mockCreateCharacter = vi.mocked(createCharacter);

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
    },
  ],
  backgrounds: [
    { id: "bg-sage", name: "Sage", skillProficiencies: ["history"], toolProficiencies: [], abilityChoices: [], originFeat: null },
    {
      id: "bg-crim",
      name: "Criminal",
      skillProficiencies: ["stealth"],
      toolProficiencies: ["Thieves' Tools"],
      abilityChoices: ["dexterity", "constitution", "intelligence"],
      originFeat: { id: "feat-alert", name: "Alert", description: "You gain a bonus to Initiative.", category: "origin" },
    },
  ],
  alignments: ["Lawful Good"],
  artisanTools: [{ name: "Smith's Tools", category: "artisan" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockFetchReference.mockResolvedValue(referenceFixture);
  mockFetchItems.mockResolvedValue([]);
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
    });

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/characters/new-1", { replace: true }),
    );
  });

  it("surfaces the ability spread + origin feat for a specced background and hides it on reset (#1130)", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText(/name/i);

    await user.selectOptions(screen.getByLabelText("Background"), "Criminal");
    expect(screen.getByRole("button", { name: "+2 / +1" })).toBeInTheDocument();
    expect(screen.getByText(/Origin feat: Alert/i)).toBeInTheDocument();

    // Switching to a spec-less background removes the section (draft reset).
    await user.selectOptions(screen.getByLabelText("Background"), "Sage");
    expect(screen.queryByRole("button", { name: "+2 / +1" })).not.toBeInTheDocument();
  });
});
