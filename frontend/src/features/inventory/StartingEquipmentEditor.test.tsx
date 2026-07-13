import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import StartingEquipmentEditor from "@/features/inventory/StartingEquipmentEditor";
import { emptyPackageState, type EquipmentDraft } from "@/lib/startingEquipment";
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

const catalog: Item[] = [
  weaponItem({ id: "longsword", name: "Longsword", weapon: { weaponClass: "martial", weaponRange: "melee" } }),
  weaponItem({ id: "shortbow", name: "Shortbow", weapon: { weaponClass: "simple", weaponRange: "ranged" } }),
  weaponItem({ id: "dagger", name: "Dagger", weapon: { weaponClass: "simple", weaponRange: "melee" } }),
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
