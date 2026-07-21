import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import CastResultWell from "@/features/session/CastResultWell";
import type { CastSettleView } from "@/features/session/useSpellPicker";

describe("CastResultWell", () => {
  it("shows the dashed placeholder before any cast", () => {
    render(<CastResultWell settle={null} />);
    expect(screen.getByText(/its roll and what to announce land here/i)).toBeInTheDocument();
  });

  it("fills in place with the kept dice, total, and damage type after a cast", () => {
    const settle: CastSettleView = {
      spellId: "sp-1",
      spellName: "Burning Hands",
      level: 1,
      dice: [4, 6, 4],
      total: 14,
      damageType: "fire",
      announce: "DC 15 Dexterity save",
    };
    render(<CastResultWell settle={settle} />);
    expect(screen.getByText("Result · Burning Hands")).toBeInTheDocument();
    expect(screen.getAllByText("4", { selector: "span" })).toHaveLength(2);
    expect(screen.getByText("6", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("14 fire")).toBeInTheDocument();
    expect(screen.getByText(/Announce: DC 15 Dexterity save · logged to the session/)).toBeInTheDocument();
  });

  it("shows a no-roll line for a buff/utility cast", () => {
    const settle: CastSettleView = {
      spellId: "sp-2",
      spellName: "Mage Armor",
      level: 1,
      dice: [],
      total: null,
      damageType: null,
      announce: null,
    };
    render(<CastResultWell settle={settle} />);
    expect(screen.getByText("No roll — effect applied")).toBeInTheDocument();
    expect(screen.queryByText(/Announce:/)).not.toBeInTheDocument();
  });
});
