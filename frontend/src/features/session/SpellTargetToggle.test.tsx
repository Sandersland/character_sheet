import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SpellTargetToggle from "@/features/session/SpellTargetToggle";

describe("SpellTargetToggle", () => {
  it("reports the chosen target on click", async () => {
    const onSelect = vi.fn();
    render(<SpellTargetToggle target="self" locked={false} disabled={false} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: "other" }));
    expect(onSelect).toHaveBeenCalledWith("other");
  });

  it("disables both buttons when locked", () => {
    render(<SpellTargetToggle target="self" locked disabled={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "self" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "other" })).toBeDisabled();
  });
});
