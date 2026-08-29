import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import StartingEquipmentEditor from "@/features/inventory/StartingEquipmentEditor";
import { draftToInput, emptyPackageState, isGoldValid, type EquipmentDraft } from "@/lib/startingEquipment";
import type { ClassStartingEquipment, Item, WeaponDetail } from "@/types/character";

function weaponItem(props: {
  id: string;
  name: string;
  weapon: Pick<WeaponDetail, "weaponClass" | "weaponRange">;
}): Item {
  return {
    id: props.id,
    name: props.name,
    category: "weapon",
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageModifier: 0,
      damageType: "slashing",
      finesse: false,
      light: false,
      heavy: false,
      twoHanded: false,
      reach: false,
      thrown: false,
      ammunition: false,
      ...props.weapon,
    },
  };
}

function toolItem(props: { id: string; name: string; toolCategory: Item["toolCategory"] }): Item {
  return { id: props.id, name: props.name, category: "gear", toolCategory: props.toolCategory };
}

const catalog: Item[] = [
  weaponItem({ id: "longsword", name: "Longsword", weapon: { weaponClass: "martial", weaponRange: "melee" } }),
  weaponItem({ id: "shortbow", name: "Shortbow", weapon: { weaponClass: "simple", weaponRange: "ranged" } }),
  weaponItem({ id: "dagger", name: "Dagger", weapon: { weaponClass: "simple", weaponRange: "melee" } }),
  toolItem({ id: "flute", name: "Flute", toolCategory: "musicalInstrument" }),
  toolItem({ id: "herbalism-kit", name: "Herbalism Kit", toolCategory: "other" }),
];

function packageDraft(
  startingEquipment: ClassStartingEquipment,
  overrides?: Partial<EquipmentDraft & { mode: "package" }>,
): EquipmentDraft {
  return {
    mode: "package",
    selections: emptyPackageState(startingEquipment),
    ...overrides,
  };
}

describe("StartingEquipmentEditor open picks", () => {
  it("filters the dropdown to matching weapons for a player-chosen option's open pick", async () => {
    const startingEquipment: ClassStartingEquipment = {
      groups: [
        {
          label: "(a) A martial weapon or (b) a simple weapon",
          options: [
            {
              label: "A martial weapon",
              openPicks: [{ label: "Martial weapon", filter: { weaponClass: "martial" } }],
            },
            {
              label: "A simple weapon",
              items: [{ catalogName: "Dagger" }],
            },
          ],
        },
      ],
      gold: { diceCount: 5, diceFaces: 4, multiplier: 10 },
    };
    const user = userEvent.setup();
    const onChange = vi.fn();
    const draft = packageDraft(startingEquipment, {
      selections: [{ optionIndex: 0, openPicks: [""] }],
    });
    render(
      <StartingEquipmentEditor
        startingEquipment={startingEquipment}
        catalog={catalog}
        value={draft}
        onChange={onChange}
        selectedToolChoices={[]}
      />,
    );

    expect(screen.getByText("Martial weapon")).toBeInTheDocument();
    expect(screen.getByText("(required)")).toBeInTheDocument();

    const select = screen.getByRole("combobox");
    expect(screen.getByRole("option", { name: "Longsword" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Shortbow" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Dagger" })).not.toBeInTheDocument();

    await user.selectOptions(select, "Longsword");
    expect(onChange).toHaveBeenCalledWith({
      mode: "package",
      selections: [{ optionIndex: 0, openPicks: ["Longsword"] }],
    });
  });

  it("also renders and filters an open pick on an auto-granted (single-option) bundle", async () => {
    const startingEquipment: ClassStartingEquipment = {
      groups: [
        {
          label: "An explorer's pack",
          options: [
            {
              label: "Explorer's pack",
              items: [{ catalogName: "Explorer's Pack" }],
              openPicks: [{ label: "A ranged weapon", filter: { range: "ranged" } }],
            },
          ],
        },
      ],
      gold: { diceCount: 5, diceFaces: 4, multiplier: 10 },
    };
    const user = userEvent.setup();
    const onChange = vi.fn();
    const draft = packageDraft(startingEquipment, {
      selections: [{ optionIndex: 0, openPicks: [""] }],
    });
    render(
      <StartingEquipmentEditor
        startingEquipment={startingEquipment}
        catalog={catalog}
        value={draft}
        onChange={onChange}
        selectedToolChoices={[]}
      />,
    );

    expect(screen.getByText("A ranged weapon")).toBeInTheDocument();
    const select = screen.getByRole("combobox");
    expect(screen.getByRole("option", { name: "Shortbow" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Longsword" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Dagger" })).not.toBeInTheDocument();

    await user.selectOptions(select, "Shortbow");
    expect(onChange).toHaveBeenCalledWith({
      mode: "package",
      selections: [{ optionIndex: 0, openPicks: ["Shortbow"] }],
    });
  });
});

describe("StartingEquipmentEditor — null gold (#1564)", () => {
  it("does not render the starting-gold toggle when the class has no gold dice", () => {
    const startingEquipment: ClassStartingEquipment = {
      groups: [
        { label: "Auto-granted", options: [{ label: "Dagger", items: [{ catalogName: "Dagger" }] }] },
      ],
      gold: null,
    };
    const onChange = vi.fn();
    render(
      <StartingEquipmentEditor
        startingEquipment={startingEquipment}
        catalog={catalog}
        value={packageDraft(startingEquipment)}
        onChange={onChange}
        selectedToolChoices={[]}
      />,
    );

    expect(screen.queryByText(/Starting gold/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Class equipment package" })).not.toBeInTheDocument();
  });

  it("isGoldValid/draftToInput reject a gold draft when the class has no gold dice at all", () => {
    const startingEquipment: ClassStartingEquipment = {
      groups: [{ label: "Auto-granted", options: [{ label: "Dagger", items: [{ catalogName: "Dagger" }] }] }],
      gold: null,
    };
    expect(isGoldValid(startingEquipment, 0)).toBe(false);
    expect(isGoldValid(startingEquipment, 25)).toBe(false);
    expect(draftToInput(startingEquipment, { mode: "gold", gold: 25 })).toBeNull();
  });
});

describe("StartingEquipmentEditor — toolCategory open pick (#1564)", () => {
  it("filters the dropdown to matching tools, not weapons, for a toolCategory pick", async () => {
    const startingEquipment: ClassStartingEquipment = {
      groups: [
        {
          label: "A musical instrument of your choice",
          options: [
            {
              label: "A musical instrument",
              openPicks: [{ label: "Musical instrument", filter: { toolCategory: "musicalInstrument" } }],
            },
          ],
        },
      ],
      gold: { diceCount: 5, diceFaces: 4, multiplier: 10 },
    };
    const user = userEvent.setup();
    const onChange = vi.fn();
    const draft = packageDraft(startingEquipment, {
      selections: [{ optionIndex: 0, openPicks: [""] }],
    });
    render(
      <StartingEquipmentEditor
        startingEquipment={startingEquipment}
        catalog={catalog}
        value={draft}
        onChange={onChange}
        selectedToolChoices={[]}
      />,
    );

    const select = screen.getByRole("combobox");
    expect(screen.getByRole("option", { name: "Flute" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Herbalism Kit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Longsword" })).not.toBeInTheDocument();

    await user.selectOptions(select, "Flute");
    expect(onChange).toHaveBeenCalledWith({
      mode: "package",
      selections: [{ optionIndex: 0, openPicks: ["Flute"] }],
    });
  });
});

// matchesPick must filter a boundToToolChoice pick to selectedToolChoices only, never by toolCategory (#1336).
describe("StartingEquipmentEditor — boundToToolChoice open pick (#1564, #1336)", () => {
  const startingEquipment: ClassStartingEquipment = {
    groups: [
      {
        label: "Artisan's Tools or Musical Instrument chosen for the tool proficiency above",
        options: [
          {
            label: "The tool chosen above",
            openPicks: [{ label: "the tool chosen above", filter: {}, boundToToolChoice: true }],
          },
        ],
      },
    ],
    gold: { diceCount: 5, diceFaces: 4, multiplier: 10 },
  };

  it("offers only the character's chosen tool proficiency, never every weapon in the catalog", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const draft = packageDraft(startingEquipment, { selections: [{ optionIndex: 0, openPicks: [""] }] });
    render(
      <StartingEquipmentEditor
        startingEquipment={startingEquipment}
        catalog={catalog}
        value={draft}
        onChange={onChange}
        selectedToolChoices={["Flute"]}
      />,
    );

    const select = screen.getByRole("combobox");
    expect(screen.getByRole("option", { name: "Flute" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Herbalism Kit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Longsword" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Dagger" })).not.toBeInTheDocument();

    await user.selectOptions(select, "Flute");
    expect(onChange).toHaveBeenCalledWith({
      mode: "package",
      selections: [{ optionIndex: 0, openPicks: ["Flute"] }],
    });
  });

  it("offers nothing when the character chose a different tool proficiency", () => {
    const draft = packageDraft(startingEquipment, { selections: [{ optionIndex: 0, openPicks: [""] }] });
    render(
      <StartingEquipmentEditor
        startingEquipment={startingEquipment}
        catalog={catalog}
        value={draft}
        onChange={vi.fn()}
        selectedToolChoices={["Herbalism Kit"]}
      />,
    );

    screen.getByRole("combobox");
    expect(screen.queryByRole("option", { name: "Flute" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Herbalism Kit" })).toBeInTheDocument();
  });
});

describe("StartingEquipmentEditor — background reuse (#1565)", () => {
  const acolyte2024Shaped: ClassStartingEquipment = {
    groups: [
      {
        label: "Starting Equipment",
        options: [
          { label: "(A) Holy Symbol and 8 GP", items: [{ catalogName: "Dagger" }], gold: 8 },
          { label: "(B) 50 GP", gold: 50 },
        ],
      },
    ],
    gold: null,
  };
  const acolyte2014Shaped: ClassStartingEquipment = {
    groups: [
      {
        label: "A holy symbol, a prayer book, and a pouch containing 15 GP",
        options: [{ label: "Holy Symbol, Prayer Book, and 15 GP", items: [{ catalogName: "Dagger" }], gold: 15 }],
      },
    ],
    gold: null,
  };

  // Synthetic fixture: real background packages always have gold: null (one mode); this one adds a gold alternative to exercise the toggle row.
  const packageWithGoldAlt: ClassStartingEquipment = {
    groups: [{ label: "Weapon", options: [{ label: "Dagger", items: [{ catalogName: "Dagger" }] }] }],
    gold: { diceCount: 5, diceFaces: 4, multiplier: 10 },
  };

  it("kind=\"class\" (the default) labels the package toggle \"Class equipment package\" when both modes exist", () => {
    render(
      <StartingEquipmentEditor
        startingEquipment={packageWithGoldAlt}
        catalog={catalog}
        value={packageDraft(packageWithGoldAlt)}
        onChange={vi.fn()}
        selectedToolChoices={[]}
      />,
    );
    expect(screen.getByRole("button", { name: "Class equipment package" })).toBeInTheDocument();
  });

  it("kind=\"background\" labels the package toggle \"Background equipment package\" when both modes exist", () => {
    render(
      <StartingEquipmentEditor
        startingEquipment={packageWithGoldAlt}
        catalog={catalog}
        value={packageDraft(packageWithGoldAlt)}
        onChange={vi.fn()}
        selectedToolChoices={[]}
        kind="background"
      />,
    );
    expect(screen.getByRole("button", { name: "Background equipment package" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Class equipment package" })).not.toBeInTheDocument();
  });

  it("hides the toggle row entirely for a background package with no gold alternative (the real shape)", () => {
    render(
      <StartingEquipmentEditor
        startingEquipment={acolyte2024Shaped}
        catalog={catalog}
        value={packageDraft(acolyte2024Shaped)}
        onChange={vi.fn()}
        selectedToolChoices={[]}
        kind="background"
      />,
    );
    expect(screen.queryByRole("button", { name: "Background equipment package" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Class equipment package" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Starting gold/)).not.toBeInTheDocument();
  });

  it("a 2024-shaped (multi-option) background package renders a real choice — two radio options", () => {
    render(
      <StartingEquipmentEditor
        startingEquipment={acolyte2024Shaped}
        catalog={catalog}
        value={packageDraft(acolyte2024Shaped)}
        onChange={vi.fn()}
        selectedToolChoices={[]}
        kind="background"
      />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.queryByText("(auto-granted)")).not.toBeInTheDocument();
  });

  it("a 2014 Acolyte-shaped (single-option) background package renders as auto-granted, never a radio choice", () => {
    render(
      <StartingEquipmentEditor
        startingEquipment={acolyte2014Shaped}
        catalog={catalog}
        value={packageDraft(acolyte2014Shaped)}
        onChange={vi.fn()}
        selectedToolChoices={[]}
        kind="background"
      />,
    );
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText("(auto-granted)")).toBeInTheDocument();
  });
});
