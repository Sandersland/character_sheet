import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ChipToggle from "@/components/ui/ChipToggle";
import ChipGroup from "@/components/ui/ChipGroup";

describe("ChipToggle", () => {
  it("reflects pressed state via aria-pressed", () => {
    render(
      <ChipToggle pressed onChange={() => {}}>
        Finesse
      </ChipToggle>,
    );
    expect(screen.getByRole("button", { name: "Finesse" })).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles the value on click", async () => {
    const onChange = vi.fn();
    render(
      <ChipToggle pressed={false} onChange={onChange}>
        Light
      </ChipToggle>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("ChipGroup", () => {
  it("groups chips under an accessible label", () => {
    render(
      <ChipGroup label="Weapon properties">
        <ChipToggle pressed={false} onChange={() => {}}>
          Heavy
        </ChipToggle>
      </ChipGroup>,
    );
    expect(screen.getByRole("group", { name: "Weapon properties" })).toBeInTheDocument();
  });
});
