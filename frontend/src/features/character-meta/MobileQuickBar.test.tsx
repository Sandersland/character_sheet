import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import MobileQuickBar from "@/features/character-meta/MobileQuickBar";
import { RollProvider } from "@/features/dice/RollContext";
import type { Character } from "@/types/character";

const character = { initiativeBonus: 2, speed: 30, proficiencyBonus: 3 } as Character;

function renderBar() {
  return render(
    <RollProvider>
      <MobileQuickBar character={character} />
    </RollProvider>,
  );
}

describe("MobileQuickBar", () => {
  it("renders three self-labeled cells: Prof Bonus, Speed, Initiative", () => {
    renderBar();
    expect(screen.getByText("Prof Bonus")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.getByText("Speed")).toBeInTheDocument();
    expect(screen.getByText("30 ft")).toBeInTheDocument();
    expect(screen.getByText("Initiative")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("orders the cells Prof · Speed · Initiative", () => {
    const { container } = renderBar();
    const text = container.textContent ?? "";
    expect(text.indexOf("Prof Bonus")).toBeLessThan(text.indexOf("Speed"));
    expect(text.indexOf("Speed")).toBeLessThan(text.indexOf("Initiative"));
  });

  it("is a flat strip: no heading, no 'vitals' copy", () => {
    renderBar();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByText(/vitals/i)).toBeNull();
  });

  it("drops tile chrome and carries hairline dividers", () => {
    const { container } = renderBar();
    expect(container.querySelector(".rounded-control")).toBeNull();
    expect(container.querySelector(".bg-parchment-100")).toBeNull();
    expect(container.querySelector(".divide-x")).not.toBeNull();
  });

  it("keeps Initiative as a roll affordance", () => {
    renderBar();
    const roll = screen.getByTitle(/Roll Initiative/);
    expect(roll.tagName).toBe("BUTTON");
  });
});
