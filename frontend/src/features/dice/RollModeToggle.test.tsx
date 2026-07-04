import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RollModeToggle from "@/features/dice/RollModeToggle";
import { RollProvider, useRoll } from "@/features/dice/RollContext";

function ModeProbe() {
  const { mode } = useRoll();
  return <span data-testid="mode">{mode}</span>;
}

function setup() {
  return render(
    <RollProvider>
      <RollModeToggle />
      <ModeProbe />
    </RollProvider>,
  );
}

describe("RollModeToggle", () => {
  it("defaults to normal with that option pressed", () => {
    setup();
    expect(screen.getByTestId("mode").textContent).toBe("normal");
    expect(screen.getByRole("button", { name: /normal/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("selects advantage and disadvantage, updating context and pressed state", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: /^advantage$/i }));
    expect(screen.getByTestId("mode").textContent).toBe("advantage");
    expect(screen.getByRole("button", { name: /^advantage$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: /^disadvantage$/i }));
    expect(screen.getByTestId("mode").textContent).toBe("disadvantage");
    expect(screen.getByRole("button", { name: /^advantage$/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("clicking an active mode returns to normal (toggle off)", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /^advantage$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^advantage$/i }));
    expect(screen.getByTestId("mode").textContent).toBe("normal");
  });
});
