import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import CharacterCreatePage from "@/pages/CharacterCreatePage";
import { createCharacter, fetchCampaigns, fetchItems, fetchReference, fetchSpells } from "@/api/client";
import { seedEditions } from "@/test/editions";
import type { Campaign, ReferenceData } from "@/types/character";

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
  fetchCampaigns: vi.fn(),
  createCharacter: vi.fn(),
  addCharacterToCampaign: vi.fn(),
  // CreationEntryGate calls useEditions (#1436); a full-factory mock must list it
  // or the query fn is undefined and the gate throws on mount.
  fetchEditions: vi.fn(),
}));

const mockFetchReference = vi.mocked(fetchReference);
const mockFetchItems = vi.mocked(fetchItems);
const mockFetchSpells = vi.mocked(fetchSpells);
const mockFetchCampaigns = vi.mocked(fetchCampaigns);
const mockCreateCharacter = vi.mocked(createCharacter);

// A tiny Bard catalog for the creation spell picker (#1131): one cantrip + one L1.
const SPELL_CATALOG = [
  { id: "sp-mockery", name: "Vicious Mockery", level: 0, school: "enchantment", castingTime: "1 action", range: "60 ft", duration: "Instantaneous", description: "", classes: ["bard"] },
  { id: "sp-charm", name: "Charm Person", level: 1, school: "enchantment", castingTime: "1 action", range: "30 ft", duration: "1 hour", description: "", classes: ["bard"] },
];

const referenceFixture: ReferenceData = {
  species: [{
    id: "sp-human", name: "Human", slug: "human", speed: 30, abilityIncreases: [],
    needsCastingAbility: false, chooseSkills: null, chooseCantrip: null, chooseOriginFeat: false, variants: [],
  }],
  classes: [
    {
      id: "class-bard",
      name: "Bard",
      hitDie: "d8",
      savingThrows: [],
      skillChoiceCount: 2,
      skillChoices: ["acrobatics", "arcana", "stealth"],
      isSpellcaster: true,
      subclassGateLevel: 3,
      subclasses: [],
      startingEquipment: null,
      multiclassPrerequisite: null,
      toolProficiencies: [],
      toolChoices: ["Lute", "Drum", "Flute"],
      toolChoiceCount: 2,
      level1SpellPicks: { cantrips: 1, spells: 1, maxSpellLevel: 1 },
      primaryAbility: ["charisma"],
    },
    {
      id: "class-fighter",
      name: "Fighter",
      hitDie: "d10",
      savingThrows: [],
      skillChoiceCount: 2,
      skillChoices: ["athletics", "acrobatics", "perception"],
      isSpellcaster: false,
      subclassGateLevel: 3,
      subclasses: [],
      startingEquipment: null,
      multiclassPrerequisite: null,
      toolProficiencies: [],
      toolChoices: [],
      toolChoiceCount: 0,
      level1SpellPicks: null,
      primaryAbility: ["strength", "dexterity"],
    },
  ],
  backgrounds: [
    { id: "bg-sage", name: "Sage", skillProficiencies: ["history"], toolProficiencies: [], abilityChoices: [], originFeat: null, startingEquipment: null },
    {
      id: "bg-crim",
      name: "Criminal",
      skillProficiencies: ["stealth"],
      toolProficiencies: ["Thieves' Tools"],
      abilityChoices: ["dexterity", "constitution", "intelligence"],
      originFeat: { id: "feat-alert", name: "Alert", description: "You gain a bonus to Initiative.", category: "origin" },
      startingEquipment: null,
    },
    {
      id: "bg-soldier",
      name: "Soldier",
      skillProficiencies: ["athletics"],
      toolProficiencies: ["Dice Set"],
      abilityChoices: ["strength", "dexterity", "constitution"],
      originFeat: { id: "feat-savage", name: "Savage Attacker", description: "Reroll weapon damage.", category: "origin" },
      startingEquipment: null,
    },
  ],
  alignments: ["Lawful Good"],
  artisanTools: [{ name: "Smith's Tools", category: "artisan" }],
  conditions: [],
  universalActions: [],
  itemRarities: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockFetchReference.mockResolvedValue(referenceFixture);
  mockFetchItems.mockResolvedValue([]);
  mockFetchSpells.mockResolvedValue(SPELL_CATALOG as never);
  // Solo world by default (#1286): no campaigns to choose from, so the entry
  // gate goes straight to the edition picker.
  mockFetchCampaigns.mockResolvedValue([]);
  mockCreateCharacter.mockResolvedValue({ id: "new-1" } as never);
  // The entry gate waits on /api/editions too (#1436); seeding the cache resolves
  // it with no request, so no spec here needs to await a second round-trip.
  seedEditions();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/characters/new"]}>
      <CharacterCreatePage />
    </MemoryRouter>,
  );
}

const user = () => userEvent.setup();

// #1286: the entry gate resolves rulesEdition before the ceremony's identity
// step is reachable at all. Every ceremony-walking test accepts the 2024
// default and continues past it first.
async function passEntryGate(u: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("radio", { name: "2024 rules" });
  await u.click(screen.getByRole("button", { name: /continue/i }));
}

// #1325's 2014 half of the entry gate, reached via campaign inheritance rather
// than the picker: #1371 gates the "2014 rules" radio (aria-disabled), so
// direct selection can no longer drive draft.rulesEdition to 2014 in the real
// UI — the caller must mock fetchCampaigns to return a 2014 campaign and this
// helper picks it, mirroring how e2e/helpers/creation.ts reaches 2014 (#1372
// restores direct selection).
async function passEntryGate2014(u: ReturnType<typeof userEvent.setup>, campaignName: string) {
  await u.click(await screen.findByRole("radio", { name: campaignName }));
  await u.click(screen.getByRole("button", { name: /continue/i }));
}

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
  // Human has no variants under this fixture — the two-step picker (#1680)
  // renders no second panel, so selecting it alone completes the identity gate.
  await u.selectOptions(screen.getByLabelText(/species/i), "Human");
  await u.selectOptions(screen.getByLabelText(/class/i), className);
  await u.selectOptions(screen.getByLabelText("Background"), background);
}

describe("CharacterCreatePage (#1176 ceremony)", () => {
  it("walks the rail and builds the create payload, navigating on confirm", async () => {
    const u = user();
    renderPage();
    await passEntryGate(u);

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

    // Spells step (#1160): add straight from the row pills.
    await u.click(await screen.findByRole("button", { name: "Add Vicious Mockery" }));
    await u.click(screen.getByRole("button", { name: "Add Charm Person" }));
    await continueStep(u); // → Equipment
    await continueStep(u); // → Review

    // Nothing is created until Review's confirm.
    expect(mockCreateCharacter).not.toHaveBeenCalled();

    await u.click(screen.getByRole("button", { name: /create character/i }));

    await waitFor(() => expect(mockCreateCharacter).toHaveBeenCalledTimes(1));
    expect(mockCreateCharacter).toHaveBeenCalledWith({
      name: "Alric",
      alignment: "Lawful Good",
      speciesId: "sp-human",
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
      startingEquipment: undefined,
      spells: { cantripIds: ["sp-mockery"], spellIds: ["sp-charm"] },
      rulesEdition: "EDITION_2024",
    });

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/characters/new-1", { replace: true }));
  });

  it("shows a Spells step in the rail for a level-1 caster (#1131)", async () => {
    const u = user();
    renderPage();
    await passEntryGate(u);
    await u.selectOptions(await screen.findByLabelText(/class/i), "Bard");
    expect(railLabels()).toContain("Step 4: Spells");
  });

  it("has no Spells step in the rail for a non-caster (#1131)", async () => {
    const u = user();
    renderPage();
    await passEntryGate(u);
    await u.selectOptions(await screen.findByLabelText(/class/i), "Fighter");
    expect(railLabels().some((l) => l?.includes("Spells"))).toBe(false);
  });

  it("surfaces the ability spread + origin feat on the Abilities step and hides it on reset (#1130)", async () => {
    const u = user();
    renderPage();
    await passEntryGate(u);
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
    await passEntryGate(u);
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
    await passEntryGate(u);
    await fillIdentity(u, { background: "Criminal" });
    await continueStep(u); // → Abilities

    await u.click(screen.getByRole("radio", { name: "+2 to Dexterity" }));
    await u.click(screen.getByRole("radio", { name: "+1 to Intelligence" }));

    await u.click(screen.getByRole("button", { name: "+2 / +1" }));
    expect((screen.getByRole("radio", { name: "+2 to Dexterity" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "+1 to Intelligence" }) as HTMLInputElement).checked).toBe(true);
  });
});

// #1325: the subclass picker's shape must follow the REQUESTED edition's
// subclassGateLevel, not a value the frontend derives itself — a raw catalog
// column read directly would be a frontend-originated rule (CLAUDE.md,
// post-#1272 no exception). Two hand-authored fixtures, one per edition — the
// gate numbers below (1 vs 3) are LITERALS, never computed from `edition`,
// so this test can't re-derive the rule it's asserting against.
const cleric = (subclassGateLevel: number): ReferenceData["classes"][number] => ({
  id: "class-cleric",
  name: "Cleric",
  hitDie: "d8",
  savingThrows: [],
  skillChoiceCount: 2,
  skillChoices: ["history", "insight", "medicine", "persuasion", "religion"],
  isSpellcaster: true,
  subclassGateLevel,
  subclasses: [{ id: "sc-life", name: "Life Domain", description: "" }],
  startingEquipment: null,
  multiclassPrerequisite: null,
  toolProficiencies: [],
  toolChoices: [],
  toolChoiceCount: 0,
  level1SpellPicks: { cantrips: 3, spells: 2, maxSpellLevel: 1 },
  primaryAbility: ["wisdom"],
});

const REFERENCE_2024: ReferenceData = { ...referenceFixture, classes: [...referenceFixture.classes, cleric(3)] };
const REFERENCE_2014: ReferenceData = { ...referenceFixture, classes: [...referenceFixture.classes, cleric(1)] };

describe("CharacterCreatePage — subclass gate per edition (#1325)", () => {
  beforeEach(() => {
    mockFetchReference.mockImplementation((edition) =>
      Promise.resolve(edition === "EDITION_2014" ? REFERENCE_2014 : REFERENCE_2024),
    );
  });

  it("offers a 2024 Cleric no subclass at creation", async () => {
    const u = user();
    renderPage();
    await passEntryGate(u);
    await u.selectOptions(await screen.findByLabelText(/class/i), "Cleric");

    expect(screen.queryByRole("combobox", { name: /subclass/i })).not.toBeInTheDocument();
    expect(screen.getByText("Chosen at level 3")).toBeInTheDocument();
  });

  it("offers a 2014 Cleric a subclass at creation", async () => {
    const campaign: Campaign = {
      id: "camp-2014",
      name: "Old Ways Table",
      ownerId: "u1",
      rulesEdition: "EDITION_2014",
      rulesEditionLabel: "2014 rules",
      inviteCode: "abc123",
      createdAt: new Date().toISOString(),
      role: "OWNER",
      members: [],
    };
    mockFetchCampaigns.mockResolvedValueOnce([campaign]);

    const u = user();
    renderPage();
    await passEntryGate2014(u, campaign.name);
    await u.selectOptions(await screen.findByLabelText(/class/i), "Cleric");

    expect(screen.getByRole("combobox", { name: /subclass/i })).toBeInTheDocument();
  });
});
