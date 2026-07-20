import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import CharacterCreatePage from "@/pages/CharacterCreatePage";
import { createCharacter, fetchItems, fetchReference, fetchSpells } from "@/api/client";
import type { ReferenceData } from "@/types/character";

// Real: useCharacterDraft, useReferenceData, the ability/skill/tool DOM. Mock the
// router navigate and the API client.

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
    { id: "bg-sage", name: "Sage", skillProficiencies: ["history"], toolProficiencies: [], abilityChoices: [], originFeat: null },
    {
      id: "bg-crim",
      name: "Criminal",
      skillProficiencies: ["stealth"],
      toolProficiencies: ["Thieves' Tools"],
      abilityChoices: ["dexterity", "constitution", "intelligence"],
      originFeat: { id: "feat-alert", name: "Alert", description: "You gain a bonus to Initiative.", category: "origin" },
    },
    {
      id: "bg-soldier",
      name: "Soldier",
      skillProficiencies: ["athletics"],
      toolProficiencies: ["Dice Set"],
      abilityChoices: ["strength", "dexterity", "constitution"],
      originFeat: { id: "feat-savage", name: "Savage Attacker", description: "Reroll weapon damage.", category: "origin" },
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

const user = () => userEvent.setup();

function railLabels(): (string | null)[] {
  return screen.getAllByRole("listitem").map((li) => li.getAttribute("aria-label"));
}

async function continueStep(u: ReturnType<typeof userEvent.setup>) {
  await u.click(screen.getByRole("button", { name: /continue/i }));
}

async function fillIdentity(
  u: ReturnType<typeof userEvent.setup>,
  { className = "Bard", background = "Sage" } = {},
) {
  await u.type(await screen.findByLabelText(/name/i), "Alric");
  await u.selectOptions(screen.getByLabelText(/alignment/i), "Lawful Good");
  await u.selectOptions(screen.getByLabelText(/race/i), "Human");
  await u.selectOptions(screen.getByLabelText(/class/i), className);
  await u.selectOptions(screen.getByLabelText("Background"), background);
}

describe("CharacterCreatePage (#1176 ceremony)", () => {
  it("walks the rail and builds the create payload, navigating on confirm", async () => {
    const u = user();
    renderPage();

    // Identity: Continue is disabled until the five fields are set.
    await screen.findByLabelText(/name/i);
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    await fillIdentity(u, { className: "Bard", background: "Sage" });
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();

    await continueStep(u); // → Abilities
    await continueStep(u); // → Skills & Tools

    await u.click(screen.getByRole("checkbox", { name: "Acrobatics" }));
    await u.click(screen.getByRole("checkbox", { name: "Arcana" }));
    await u.click(screen.getByRole("checkbox", { name: "Lute" }));
    await u.click(screen.getByRole("checkbox", { name: "Drum" }));
    await continueStep(u); // → Spells

    await u.click(await screen.findByRole("checkbox", { name: /Vicious Mockery/ }));
    await u.click(screen.getByRole("checkbox", { name: /Charm Person/ }));
    await continueStep(u); // → Equipment
    await continueStep(u); // → Review

    // Nothing is created until Review's confirm.
    expect(mockCreateCharacter).not.toHaveBeenCalled();

    await u.click(screen.getByRole("button", { name: /create character/i }));

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

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/characters/new-1", { replace: true }));
  });

  it("shows a Spells step in the rail for a level-1 caster (#1131)", async () => {
    const u = user();
    renderPage();
    await u.selectOptions(await screen.findByLabelText(/class/i), "Bard");
    expect(railLabels()).toContain("Step 4: Spells");
  });

  it("has no Spells step in the rail for a non-caster (#1131)", async () => {
    const u = user();
    renderPage();
    await u.selectOptions(await screen.findByLabelText(/class/i), "Fighter");
    expect(railLabels().some((l) => l?.includes("Spells"))).toBe(false);
  });

  it("surfaces the ability spread + origin feat on the Abilities step and hides it on reset (#1130)", async () => {
    const u = user();
    renderPage();
    await fillIdentity(u, { background: "Criminal" });
    await continueStep(u); // → Abilities

    expect(screen.getByRole("button", { name: "+2 / +1" })).toBeInTheDocument();
    expect(screen.getByText(/Origin feat: Alert/i)).toBeInTheDocument();

    // Back to Identity, switch to a spec-less background — the spread is gone.
    await u.click(screen.getByRole("button", { name: /back/i }));
    await u.selectOptions(screen.getByLabelText("Background"), "Sage");
    await continueStep(u); // → Abilities
    expect(screen.queryByRole("button", { name: "+2 / +1" })).not.toBeInTheDocument();
  });

  it("resets the spread mode when switching between two specced backgrounds (#1130)", async () => {
    const u = user();
    renderPage();
    await fillIdentity(u, { background: "Criminal" });
    await continueStep(u); // → Abilities

    await u.click(screen.getByRole("button", { name: "+1 / +1 / +1" }));
    expect(screen.getByRole("button", { name: "+1 / +1 / +1" })).toHaveAttribute("aria-pressed", "true");

    await u.click(screen.getByRole("button", { name: /back/i }));
    await u.selectOptions(screen.getByLabelText("Background"), "Soldier");
    await continueStep(u); // → Abilities

    expect(screen.getByText("Origin feat: Savage Attacker")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+2 / +1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "+1 / +1 / +1" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the +2/+1 selections when the already-active mode button is clicked (#1130)", async () => {
    const u = user();
    renderPage();
    await fillIdentity(u, { background: "Criminal" });
    await continueStep(u); // → Abilities

    await u.selectOptions(screen.getByLabelText(/\+2 to/), "dexterity");
    await u.selectOptions(screen.getByLabelText(/\+1 to/), "intelligence");

    await u.click(screen.getByRole("button", { name: "+2 / +1" }));
    expect((screen.getByLabelText(/\+2 to/) as HTMLSelectElement).value).toBe("dexterity");
    expect((screen.getByLabelText(/\+1 to/) as HTMLSelectElement).value).toBe("intelligence");
  });
});
