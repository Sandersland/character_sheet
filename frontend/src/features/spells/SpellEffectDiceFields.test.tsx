import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SpellEffectDiceFields from "@/features/spells/SpellEffectDiceFields";

describe("SpellEffectDiceFields — instance count (#1984)", () => {
  it("always shows the instance count input", () => {
    render(<SpellEffectDiceFields draft={{}} update={vi.fn()} />);
    expect(screen.getByLabelText(/instance count/i)).toBeInTheDocument();
  });

  it("hides the roll-mode select when instanceCount is unset", () => {
    render(<SpellEffectDiceFields draft={{}} update={vi.fn()} />);
    expect(screen.queryByLabelText(/roll damage/i)).not.toBeInTheDocument();
  });

  it("hides the roll-mode select when instanceCount is exactly 1", () => {
    render(<SpellEffectDiceFields draft={{ instanceCount: 1 }} update={vi.fn()} />);
    expect(screen.queryByLabelText(/roll damage/i)).not.toBeInTheDocument();
  });

  it("shows the roll-mode select once instanceCount is greater than 1", () => {
    render(<SpellEffectDiceFields draft={{ instanceCount: 3 }} update={vi.fn()} />);
    expect(screen.getByLabelText(/roll damage/i)).toBeInTheDocument();
  });

  it("offers plain-English roll-mode labels, not the raw each/once values", () => {
    render(<SpellEffectDiceFields draft={{ instanceCount: 3 }} update={vi.fn()} />);
    expect(screen.getByRole("option", { name: /roll damage per instance/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /roll once, apply to every instance/i })).toBeInTheDocument();
  });

  it("calls update with the parsed instance count", async () => {
    const update = vi.fn();
    const user = userEvent.setup();
    render(<SpellEffectDiceFields draft={{}} update={update} />);
    await user.type(screen.getByLabelText(/instance count/i), "3");
    expect(update).toHaveBeenLastCalledWith({ instanceCount: 3 });
  });

  it("clearing instance count sends undefined and drops the roll-mode select", async () => {
    const update = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<SpellEffectDiceFields draft={{ instanceCount: 3 }} update={update} />);
    await user.clear(screen.getByLabelText(/instance count/i));
    expect(update).toHaveBeenLastCalledWith({ instanceCount: undefined });

    rerender(<SpellEffectDiceFields draft={{ instanceCount: undefined }} update={update} />);
    expect(screen.queryByLabelText(/roll damage/i)).not.toBeInTheDocument();
  });

  it("selecting a roll mode calls update with instanceRoll", async () => {
    const update = vi.fn();
    const user = userEvent.setup();
    render(<SpellEffectDiceFields draft={{ instanceCount: 3 }} update={update} />);
    await user.selectOptions(screen.getByLabelText(/roll damage/i), "once");
    expect(update).toHaveBeenLastCalledWith({ instanceRoll: "once" });
  });
});
