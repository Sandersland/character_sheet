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

describe("HpActionControl accumulator chips (#796)", () => {
  it("builds the amount via chips + ±1 flanks and applies it, no typing", async () => {
    const { onApply, user } = setup();

    // +10 +5 then two Increase-amount taps = 17 damage, then Apply.
    await user.click(screen.getByRole("button", { name: "Add 10" }));
    await user.click(screen.getByRole("button", { name: "Add 5" }));
    await user.click(screen.getByRole("button", { name: "Increase amount" }));
    await user.click(screen.getByRole("button", { name: "Increase amount" }));

    await user.click(screen.getByRole("button", { name: "Apply 17 damage" }));

    expect(onApply).toHaveBeenCalledWith("damage", 17, {
      damageType: undefined,
      applyResistance: true,
    });
  });

  it("drops the +1 chip; +5/+10/+20/Clear remain", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Add 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 10" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 20" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear amount" })).toBeInTheDocument();
  });

  it("the −/+ flanks step the amount by exactly 1", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Add 5" }));
    await user.click(screen.getByRole("button", { name: "Increase amount" }));
    expect(screen.getByRole("spinbutton", { name: /damage amount/i })).toHaveValue(6);
    await user.click(screen.getByRole("button", { name: "Decrease amount" }));
    expect(screen.getByRole("spinbutton", { name: /damage amount/i })).toHaveValue(5);
  });

  it("has a single readout-size amount input", () => {
    setup();
    expect(screen.getAllByRole("spinbutton", { name: /damage amount/i })).toHaveLength(1);
  });

  it("accepts keyboard entry and Enter-to-apply", async () => {
    const { onApply, user } = setup();
    const input = screen.getByRole("spinbutton", { name: /damage amount/i });
    await user.type(input, "22{Enter}");
    expect(onApply).toHaveBeenCalledWith("damage", 22, {
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

describe("HpActionControl projected-result line (#796)", () => {
  it("damage projects the resulting current / max without an amount prefix", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Add 5" }));
    expect(screen.getByText("→ 15 / 40")).toBeInTheDocument();
  });

  it("heal caps the projection at max HP", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("radio", { name: /heal/i }));
    await user.click(screen.getByRole("button", { name: "Add 20" }));
    await user.click(screen.getByRole("button", { name: "Add 20" }));
    // 20 current + 40 chips = 60, capped to 40.
    expect(screen.getByText("→ 40 / 40")).toBeInTheDocument();
  });

  it("temp projects the replacing-if-higher value", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("radio", { name: /temp hp/i }));
    await user.click(screen.getByRole("button", { name: "Add 10" }));
    expect(screen.getByText("Temp → 10")).toBeInTheDocument();
  });

  it("projects the halved amount when the damage type is resisted (#456)", async () => {
    const { user } = setup(HP, ["slashing"]);
    await user.click(screen.getByRole("button", { name: "Add 10" }));
    await user.click(screen.getByRole("button", { name: "Increase amount" }));
    await user.click(screen.getByRole("button", { name: "Increase amount" }));
    await user.selectOptions(screen.getByRole("combobox", { name: /damage type/i }), "slashing");

    // 12 slashing halves to 6 → projection matches the applied damage, not the raw 12.
    expect(screen.getByText("→ 14 / 40")).toBeInTheDocument();
  });

  it("projects the full amount when the player declines resistance", async () => {
    const { user } = setup(HP, ["slashing"]);
    await user.click(screen.getByRole("button", { name: "Add 10" }));
    await user.click(screen.getByRole("button", { name: "Increase amount" }));
    await user.click(screen.getByRole("button", { name: "Increase amount" }));
    await user.selectOptions(screen.getByRole("combobox", { name: /damage type/i }), "slashing");
    await user.click(screen.getByRole("checkbox", { name: /resistant to slashing/i }));

    expect(screen.getByText("→ 8 / 40")).toBeInTheDocument();
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
