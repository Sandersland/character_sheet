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

// #1564 commit 3: PHB'24 packages have no roll-for-gold rule at all —
// gold: null on the wire. The picker must not offer that path at all rather
// than rendering a broken range (0-0, or a crash reading .diceCount off null).
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

// #1564 commit 4: open picks widen past weapons — a genuine "musical
// instrument of your choice" pick filters the dropdown on toolCategory
// instead of weaponClass/range.
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

// PR #1567 review, fix 2: a boundToToolChoice pick (Monk's "Artisan's Tools
// or Musical Instrument chosen for the tool proficiency above") spans two
// tool categories with no single filter.toolCategory, so matchesPick's old
// fallback offered every weapon in the catalog — options the backend's
// boundToolChoiceError would then reject, a dead-end #1336 was filed against.
// The dropdown must instead offer ONLY the character's own chosen tool
// proficiencies (selectedToolChoices), regardless of category.
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
