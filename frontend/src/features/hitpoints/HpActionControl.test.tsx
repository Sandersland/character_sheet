import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HpActionControl from "@/features/hitpoints/HpActionControl";

const HP = { current: 20, max: 40, temp: 0 };

function setup(hitPoints = HP, resistedTypes: string[] = []) {
  const onApply = vi.fn().mockResolvedValue(true);
  render(
    <HpActionControl
      pending={false}
      hitPoints={hitPoints}
      onApply={onApply}
      resistedTypes={resistedTypes}
    />,
  );
  return { onApply, user: userEvent.setup() };
}

describe("HpActionControl accumulator chips (#787)", () => {
  it("builds the amount via chips and applies it in ≤ a couple taps, no typing", async () => {
    const { onApply, user } = setup();

    // +10 +5 +1 +1 = 17 damage, then Apply.
    await user.click(screen.getByRole("button", { name: "Add 10" }));
    await user.click(screen.getByRole("button", { name: "Add 5" }));
    await user.click(screen.getByRole("button", { name: "Add 1" }));
    await user.click(screen.getByRole("button", { name: "Add 1" }));

    await user.click(screen.getByRole("button", { name: "Apply 17 damage" }));

    expect(onApply).toHaveBeenCalledWith("damage", 17, {
      damageType: undefined,
      applyResistance: true,
    });
  });

  it("Clear resets the pending amount to 0 and disables Apply", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Add 20" }));
    await user.click(screen.getByRole("button", { name: "Clear amount" }));

    expect(screen.getByRole("button", { name: /apply 0 damage/i })).toBeDisabled();
  });

  it("Apply is disabled at 0", () => {
    setup();
    expect(screen.getByRole("button", { name: /apply 0 damage/i })).toBeDisabled();
  });
});

describe("HpActionControl projected-result line (#787)", () => {
  it("damage projects the resulting current / max", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Add 5" }));
    expect(screen.getByText("5 HP → 15 / 40")).toBeInTheDocument();
  });

  it("heal caps the projection at max HP", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("radio", { name: /heal/i }));
    await user.click(screen.getByRole("button", { name: "Add 20" }));
    await user.click(screen.getByRole("button", { name: "Add 20" }));
    // 20 current + 40 chips = 60, capped to 40.
    expect(screen.getByText("40 → 40 / 40")).toBeInTheDocument();
  });

  it("temp projects the replacing-if-higher value", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("radio", { name: /temp hp/i }));
    await user.click(screen.getByRole("button", { name: "Add 10" }));
    expect(screen.getByText("Temp 0 → 10")).toBeInTheDocument();
  });

  it("projects the halved amount when the damage type is resisted (#456)", async () => {
    const { user } = setup(HP, ["slashing"]);
    await user.click(screen.getByRole("button", { name: "Add 10" }));
    await user.click(screen.getByRole("button", { name: "Add 1" }));
    await user.click(screen.getByRole("button", { name: "Add 1" }));
    await user.selectOptions(screen.getByRole("combobox", { name: /damage type/i }), "slashing");

    // 12 slashing halves to 6 → projection matches the applied damage, not the raw 12.
    expect(screen.getByText("6 HP → 14 / 40")).toBeInTheDocument();
  });

  it("projects the full amount when the player declines resistance", async () => {
    const { user } = setup(HP, ["slashing"]);
    await user.click(screen.getByRole("button", { name: "Add 10" }));
    await user.click(screen.getByRole("button", { name: "Add 1" }));
    await user.click(screen.getByRole("button", { name: "Add 1" }));
    await user.selectOptions(screen.getByRole("combobox", { name: /damage type/i }), "slashing");
    await user.click(screen.getByRole("checkbox", { name: /resistant to slashing/i }));

    expect(screen.getByText("12 HP → 8 / 40")).toBeInTheDocument();
  });
});

describe("HpActionControl damage-type visibility (#787)", () => {
  it("shows the damage-type select only in Damage mode", async () => {
    const { user } = setup();
    expect(screen.getByRole("combobox", { name: /damage type/i })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /heal/i }));
    expect(screen.queryByRole("combobox", { name: /damage type/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /temp hp/i }));
    expect(screen.queryByRole("combobox", { name: /damage type/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /damage/i }));
    expect(screen.getByRole("combobox", { name: /damage type/i })).toBeInTheDocument();
  });

  it("echoes the mode verb in the Apply label", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("radio", { name: /heal/i }));
    await user.click(screen.getByRole("button", { name: "Add 10" }));
    expect(screen.getByRole("button", { name: "Heal 10" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /temp hp/i }));
    expect(screen.getByRole("button", { name: "Grant 10 temp HP" })).toBeInTheDocument();
  });
});
