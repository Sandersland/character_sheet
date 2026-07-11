import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import InitiativeRail from "@/features/session/InitiativeRail";

describe("InitiativeRail (decorative, #737)", () => {
  it("shows the player's initial and captions them 'acting' on their own turn", () => {
    render(<InitiativeRail youInitial="K" active />);
    expect(screen.getByText("K")).toBeInTheDocument();
    // The player's avatar is captioned "acting" while it's their turn.
    expect(screen.getByText("acting")).toBeInTheDocument();
    // Static placeholder order includes an enemy marker.
    expect(screen.getByText("enemy")).toBeInTheDocument();
  });

  it("captions the player 'on deck' while waiting (not their turn)", () => {
    render(<InitiativeRail youInitial="K" active={false} />);
    expect(screen.getByText("on deck")).toBeInTheDocument();
  });

  it("renders an initiative badge for each combatant in the order", () => {
    render(<InitiativeRail youInitial="K" active />);
    // Five static entries, each with an initiative roll badge.
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    for (const roll of ["19", "17", "15", "12", "8"]) {
      expect(screen.getByText(roll)).toBeInTheDocument();
    }
  });
});
