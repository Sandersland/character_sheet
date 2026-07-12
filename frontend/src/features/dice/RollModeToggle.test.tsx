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

  it("exposes a single role=group labelled 'Roll mode' with pressed buttons", () => {
    setup();
    const group = screen.getByRole("group", { name: "Roll mode" });
    expect(group).toBeInTheDocument();
    // Exactly one segmented control — no double-render across breakpoints.
    expect(screen.getAllByRole("group", { name: "Roll mode" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^advantage$/i })).toHaveLength(1);
    for (const btn of screen.getAllByRole("button")) {
      expect(btn).toHaveAttribute("aria-pressed");
    }
  });

  it("docks as a fixed bottom bar on mobile and floats bottom-left at md+", () => {
    const { container } = setup();
    const bar = container.firstElementChild as HTMLElement;
    // Mobile: full-width fixed bottom bar with top border + safe-area padding.
    expect(bar.className).toContain("fixed");
    expect(bar.className).toContain("inset-x-0");
    expect(bar.className).toContain("bottom-0");
    expect(bar.className).toContain("border-t");
    expect(bar.className).toContain("env(safe-area-inset-bottom)");
    // md+: floating bottom-6 left-6 pill (surface stripped back to the control).
    expect(bar.className).toContain("md:bottom-6");
    expect(bar.className).toContain("md:left-6");
    expect(bar.className).toContain("md:inset-x-auto");
    expect(bar.className).toContain("md:border-t-0");
  });
});
