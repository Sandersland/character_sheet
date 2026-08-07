import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HomebrewSpellForm from "@/features/spells/HomebrewSpellForm";
import * as client from "@/api/client";
import type { ClassOption, ReferenceData } from "@/types/character";

vi.mock("@/api/client", () => ({
  createCustomSpell: vi.fn(),
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
};

const noop = () => {};

describe("HomebrewSpellForm", () => {
  beforeEach(() => {
    vi.mocked(client.fetchReference).mockResolvedValue(REFERENCE);
    vi.mocked(client.createCustomSpell).mockReset();
  });

  it("renders the core fields", async () => {
    const user = userEvent.setup();
    render(<HomebrewSpellForm edition="EDITION_2014" onCreated={noop} onClose={noop} />);

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
    render(<HomebrewSpellForm edition="EDITION_2014" onCreated={noop} onClose={noop} />);

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
    render(<HomebrewSpellForm edition="EDITION_2014" onCreated={noop} onClose={noop} />);

    await user.type(screen.getByLabelText(/spell name/i), "Zap");
    await user.type(screen.getByLabelText(/description/i), "A zap.");
    await user.click(screen.getByLabelText(/enable auto-rolling on cast/i));
    await user.selectOptions(screen.getByLabelText(/effect type/i), "damage");

    await user.click(screen.getByRole("button", { name: /create homebrew spell/i }));

    expect(await screen.findByText(/dice count and dice faces/i)).toBeInTheDocument();
    expect(client.createCustomSpell).not.toHaveBeenCalled();
  });

  it("submits the correctly-shaped payload and calls onCreated", async () => {
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
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<HomebrewSpellForm edition="EDITION_2014" onCreated={onCreated} onClose={noop} />);

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
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
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
    render(<HomebrewSpellForm edition="EDITION_2014" onCreated={noop} onClose={noop} />);

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
