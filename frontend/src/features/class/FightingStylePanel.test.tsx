import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import FightingStylePanel from "@/features/class/FightingStylePanel";

describe("FightingStylePanel", () => {
  it("collapsed: shows a choose prompt when no style is set", () => {
    render(<FightingStylePanel current={null} busy={false} onChoose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /choose a fighting style/i })).toBeInTheDocument();
  });

  it("collapsed: shows the current style label (never a raw key)", () => {
    render(<FightingStylePanel current="greatWeaponFighting" busy={false} onChoose={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /change fighting style/i });
    expect(btn).toHaveTextContent("Great Weapon Fighting");
    expect(btn).not.toHaveTextContent("greatWeaponFighting");
  });

  it("expands and lists all 6 styles by their human labels", async () => {
    const user = userEvent.setup();
    render(<FightingStylePanel current={null} busy={false} onChoose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /choose a fighting style/i }));

    expect(screen.getByText("Archery")).toBeInTheDocument();
    expect(screen.getByText("Defense")).toBeInTheDocument();
    expect(screen.getByText("Two-Weapon Fighting")).toBeInTheDocument();
    // No raw camelCase key leaks.
    expect(screen.queryByText("twoWeaponFighting")).not.toBeInTheDocument();
  });

  it("calls onChoose with the selected key", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(<FightingStylePanel current={null} busy={false} onChoose={onChoose} />);
    await user.click(screen.getByRole("button", { name: /choose a fighting style/i }));
    // The button's accessible name is its text ("Choose"); scope to the Archery row.
    const archeryRow = screen.getByText("Archery").closest("li")!;
    await user.click(within(archeryRow).getByRole("button", { name: "Choose" }));
    expect(onChoose).toHaveBeenCalledWith("archery");
  });
});
