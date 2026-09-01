import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HomebrewSpellForm from "@/features/spells/HomebrewSpellForm";
import * as client from "@/api/client";
import type { ClassOption, HomebrewSpellInput, ReferenceData } from "@/types/character";

vi.mock("@/api/client", () => ({
  createCustomSpell: vi.fn(),
  updateCustomSpell: vi.fn(),
  fetchReference: vi.fn(),
}));

function classOption(over: Partial<ClassOption>): ClassOption {
  return {
    id: "wizard",
    name: "Wizard",
    hitDie: "d6",
    savingThrows: [],
    skillChoiceCount: 2,
    skillChoices: [],
    isSpellcaster: true,
    subclassGateLevel: 2,
    subclasses: [],
    startingEquipment: null,
    multiclassPrerequisite: null,
    toolProficiencies: [],
    toolChoices: [],
    toolChoiceCount: 0,
    level1SpellPicks: null,
    primaryAbility: [],
    ...over,
  };
}

const REFERENCE: ReferenceData = {
  species: [],
  classes: [classOption({ id: "wizard", name: "Wizard" }), classOption({ id: "cleric", name: "Cleric" })],
  backgrounds: [],
  alignments: [],
  artisanTools: [],
  conditions: [],
  universalActions: [],
  itemRarities: [],
  abilityGeneration: {
    standardArray: [15, 14, 13, 12, 10, 8],
    pointBuy: { budget: 27, floor: 8, ceiling: 15, costs: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 } },
    manual: { floor: 1, ceiling: 30 },
  },
};

const noop = () => {};

describe("HomebrewSpellForm", () => {
  beforeEach(() => {
    vi.mocked(client.fetchReference).mockResolvedValue(REFERENCE);
    vi.mocked(client.createCustomSpell).mockReset();
    vi.mocked(client.updateCustomSpell).mockReset();
  });

  it("renders the core fields", async () => {
    const user = userEvent.setup();
    render(<HomebrewSpellForm edition="EDITION_2014" characterId="char-1" onSaved={noop} onClose={noop} />);

    expect(screen.getByLabelText(/spell name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^level$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/school/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/casting time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^range$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^duration$/i)).toBeInTheDocument();
    expect(screen.getByText(/concentration/i)).toBeInTheDocument();
    expect(screen.getByText(/ritual/i)).toBeInTheDocument();
    expect(screen.getByText("Components")).toBeInTheDocument();
    expect(screen.getByText("Class access")).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByText(/enable auto-rolling on cast/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Wizard")).toBeInTheDocument());
    expect(screen.getByText("Cleric")).toBeInTheDocument();

    await user.click(screen.getByLabelText(/enable auto-rolling on cast/i));
    expect(screen.getByLabelText(/upcast dice.level/i)).toBeInTheDocument();
  });

  it("shows save ability only when the effect is damage with attack type 'save'", async () => {
    const user = userEvent.setup();
    render(<HomebrewSpellForm edition="EDITION_2014" characterId="char-1" onSaved={noop} onClose={noop} />);

    expect(screen.queryByLabelText(/save ability/i)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/enable auto-rolling on cast/i));
    expect(screen.queryByLabelText(/save ability/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/effect type/i), "damage");
    expect(screen.queryByLabelText(/save ability/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/attack type/i), "attack");
    expect(screen.queryByLabelText(/save ability/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/attack type/i), "save");
    expect(screen.getByLabelText(/save ability/i)).toBeInTheDocument();
  });

  it("blocks submit and shows an inline error when dice fields are missing for an enabled effect", async () => {
    const user = userEvent.setup();
    render(<HomebrewSpellForm edition="EDITION_2014" characterId="char-1" onSaved={noop} onClose={noop} />);

    await user.type(screen.getByLabelText(/spell name/i), "Zap");
    await user.type(screen.getByLabelText(/description/i), "A zap.");
    await user.click(screen.getByLabelText(/enable auto-rolling on cast/i));
    await user.selectOptions(screen.getByLabelText(/effect type/i), "damage");

    await user.click(screen.getByRole("button", { name: /create homebrew spell/i }));

    expect(await screen.findByText(/dice count and dice faces/i)).toBeInTheDocument();
    expect(client.createCustomSpell).not.toHaveBeenCalled();
  });

  it("submits the correctly-shaped payload and calls onSaved", async () => {
    vi.mocked(client.createCustomSpell).mockResolvedValue({
      id: "s1",
      ownerId: "u1",
      edition: "EDITION_2014",
      name: "Bolt",
      level: 1,
      school: "evocation",
      castingTime: "1 action",
      range: "60 feet",
      duration: "Instantaneous",
      description: "A bolt.",
      concentration: false,
      ritual: false,
      classes: ["Wizard"],
    });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<HomebrewSpellForm edition="EDITION_2014" characterId="char-1" onSaved={onSaved} onClose={noop} />);

    await user.type(screen.getByLabelText(/spell name/i), "Bolt");
    await user.type(screen.getByLabelText(/description/i), "A bolt.");

    await waitFor(() => expect(screen.getByText("Wizard")).toBeInTheDocument());
    const classFieldset = screen.getByText("Class access").closest("fieldset")!;
    await user.click(within(classFieldset).getByLabelText("Wizard"));

    await user.click(screen.getByLabelText(/enable auto-rolling on cast/i));
    await user.selectOptions(screen.getByLabelText(/effect type/i), "damage");
    await user.type(screen.getByLabelText(/dice count/i), "8");
    await user.type(screen.getByLabelText(/dice faces/i), "6");
    await user.type(screen.getByLabelText(/upcast dice.level/i), "1");
    await user.selectOptions(screen.getByLabelText(/attack type/i), "save");
    await user.selectOptions(screen.getByLabelText(/save ability/i), "dexterity");

    await user.click(screen.getByRole("button", { name: /create homebrew spell/i }));

    await waitFor(() => expect(client.createCustomSpell).toHaveBeenCalledTimes(1));
    expect(client.createCustomSpell).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Bolt",
        description: "A bolt.",
        classes: ["Wizard"],
        effectKind: "damage",
        effectDiceCount: 8,
        effectDiceFaces: 6,
        upcastDicePerLevel: 1,
        attackType: "save",
        saveAbility: "dexterity",
      }),
      "char-1",
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it("submits instanceCount/instanceRoll/upcastInstancesPerLevel once instance count is set (#1984)", async () => {
    vi.mocked(client.createCustomSpell).mockResolvedValue({
      id: "s1",
      ownerId: "u1",
      edition: "EDITION_2014",
      name: "Split Bolt",
      level: 1,
      school: "evocation",
      castingTime: "1 action",
      range: "60 feet",
      duration: "Instantaneous",
      description: "Splits.",
      concentration: false,
      ritual: false,
      classes: [],
    });
    const user = userEvent.setup();
    render(<HomebrewSpellForm edition="EDITION_2014" characterId="char-1" onSaved={noop} onClose={noop} />);

    await user.type(screen.getByLabelText(/spell name/i), "Split Bolt");
    await user.type(screen.getByLabelText(/description/i), "Splits.");
    await user.selectOptions(screen.getByLabelText(/^level$/i), "1");

    await user.click(screen.getByLabelText(/enable auto-rolling on cast/i));
    await user.selectOptions(screen.getByLabelText(/effect type/i), "damage");
    await user.type(screen.getByLabelText(/dice count/i), "1");
    await user.type(screen.getByLabelText(/dice faces/i), "4");

    expect(screen.queryByLabelText(/roll damage/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/upcast instances.level/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/instance count/i), "3");
    expect(screen.getByLabelText(/roll damage/i)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/roll damage/i), "once");
    await user.type(screen.getByLabelText(/upcast instances.level/i), "1");

    await user.click(screen.getByRole("button", { name: /create homebrew spell/i }));

    await waitFor(() => expect(client.createCustomSpell).toHaveBeenCalledTimes(1));
    expect(client.createCustomSpell).toHaveBeenCalledWith(
      expect.objectContaining({ instanceCount: 3, instanceRoll: "once", upcastInstancesPerLevel: 1 }),
      "char-1",
    );
  });

  it("omits upcastDicePerLevel from the payload when left blank", async () => {
    vi.mocked(client.createCustomSpell).mockResolvedValue({
      id: "s1",
      ownerId: "u1",
      edition: "EDITION_2014",
      name: "Zap",
      level: 0,
      school: "evocation",
      castingTime: "1 action",
      range: "60 feet",
      duration: "Instantaneous",
      description: "A zap.",
      concentration: false,
      ritual: false,
      classes: [],
    });
    const user = userEvent.setup();
    render(<HomebrewSpellForm edition="EDITION_2014" characterId="char-1" onSaved={noop} onClose={noop} />);

    await user.type(screen.getByLabelText(/spell name/i), "Zap");
    await user.type(screen.getByLabelText(/description/i), "A zap.");
    await user.click(screen.getByLabelText(/enable auto-rolling on cast/i));
    await user.selectOptions(screen.getByLabelText(/effect type/i), "heal");
    await user.type(screen.getByLabelText(/dice count/i), "2");
    await user.type(screen.getByLabelText(/dice faces/i), "4");

    await user.click(screen.getByRole("button", { name: /create homebrew spell/i }));

    await waitFor(() => expect(client.createCustomSpell).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(client.createCustomSpell).mock.calls[0][0];
    expect(payload.upcastDicePerLevel).toBeUndefined();
  });
});

describe("HomebrewSpellForm editing an existing homebrew spell", () => {
  beforeEach(() => {
    vi.mocked(client.fetchReference).mockResolvedValue(REFERENCE);
    vi.mocked(client.createCustomSpell).mockReset();
    vi.mocked(client.updateCustomSpell).mockReset();
  });

  const EXISTING_DRAFT: HomebrewSpellInput = {
    name: "Old Bolt",
    level: 2,
    school: "evocation",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Instantaneous",
    description: "The old description.",
    concentration: false,
    ritual: false,
    components: { verbal: true, somatic: false, material: false },
    classes: ["wizard"],
    effectKind: "damage",
    effectDiceCount: 4,
    effectDiceFaces: 6,
    damageType: "fire",
    attackType: "attack",
  };

  it("prefills the draft and labels the submit button 'Save changes'", async () => {
    render(
      <HomebrewSpellForm
        edition="EDITION_2014"
        characterId="char-1"
        editing={{ id: "s1", draft: EXISTING_DRAFT }}
        onSaved={noop}
        onClose={noop}
      />,
    );

    expect(screen.getByLabelText(/spell name/i)).toHaveValue("Old Bolt");
    expect(screen.getByLabelText(/description/i)).toHaveValue("The old description.");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create homebrew spell/i })).not.toBeInTheDocument();
  });

  it("submits edits via updateCustomSpell with the existing id, and calls onSaved", async () => {
    vi.mocked(client.updateCustomSpell).mockResolvedValue({
      id: "s1",
      ownerId: "u1",
      edition: "EDITION_2014",
      ...EXISTING_DRAFT,
      name: "New Bolt",
      classes: ["wizard"],
      concentration: false,
      ritual: false,
    });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(
      <HomebrewSpellForm
        edition="EDITION_2014"
        characterId="char-1"
        editing={{ id: "s1", draft: EXISTING_DRAFT }}
        onSaved={onSaved}
        onClose={noop}
      />,
    );

    const nameInput = screen.getByLabelText(/spell name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "New Bolt");

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(client.updateCustomSpell).toHaveBeenCalledTimes(1));
    expect(client.updateCustomSpell).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ name: "New Bolt", effectKind: "damage", damageType: "fire" }),
    );
    expect(client.createCustomSpell).not.toHaveBeenCalled();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });
});
