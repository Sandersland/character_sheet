import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import AttackResultLine from "@/features/session/AttackResultLine";
import type { RollResult } from "@/lib/dice";

function attack(value: number, modifier: number, total: number): RollResult {
  return {
    dice: [{ value, dropped: false }],
    modifier,
    total,
    spec: { count: 1, faces: 20, modifier },
  };
}

describe("AttackResultLine (#745)", () => {
  it("renders the die face, caption, modifier and total for an attack roll", () => {
    render(<AttackResultLine result={attack(18, 7, 25)} kind="attack" />);
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("d20")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    // modifier surfaced (rendered "+ 7")
    expect(screen.getByText(/\+\s*7/)).toBeInTheDocument();
  });

  it("renders the damage type after a damage total", () => {
    const dmg: RollResult = {
      dice: [{ value: 5, dropped: false }],
      modifier: 4,
      total: 9,
      spec: { count: 1, faces: 8, modifier: 4 },
    };
    render(<AttackResultLine result={dmg} kind="damage" damageType="slashing" />);
    expect(screen.getByText("d8")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("slashing")).toBeInTheDocument();
  });

  it("renders one die box per kept die for a multi-die roll", () => {
    const dmg: RollResult = {
      dice: [
        { value: 3, dropped: false },
        { value: 5, dropped: false },
      ],
      modifier: 3,
      total: 11,
      spec: { count: 2, faces: 6, modifier: 3 },
    };
    render(<AttackResultLine result={dmg} kind="damage" damageType="slashing" />);
    expect(screen.getAllByText("d6")).toHaveLength(2);
    expect(screen.getByText("11")).toBeInTheDocument();
  });

  it("omits dropped dice (advantage) from the boxes", () => {
    const adv: RollResult = {
      dice: [
        { value: 4, dropped: true },
        { value: 19, dropped: false },
      ],
      modifier: 5,
      total: 24,
      spec: { count: 2, faces: 20, modifier: 5, mode: "advantage" },
    };
    render(<AttackResultLine result={adv} kind="attack" />);
    expect(screen.getByText("19")).toBeInTheDocument();
    expect(screen.queryByText("4")).not.toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
  });

  it("shows the maneuver override total instead of the raw total", () => {
    render(<AttackResultLine result={attack(18, 7, 25)} kind="attack" overrideTotal={31} />);
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.queryByText("25")).not.toBeInTheDocument();
    expect(screen.getByText(/\+maneuver/)).toBeInTheDocument();
  });

  it("omits the modifier term when the modifier is zero", () => {
    // Two dice so the total (7) is distinct from either face (1, 6).
    const dmg: RollResult = {
      dice: [
        { value: 1, dropped: false },
        { value: 6, dropped: false },
      ],
      modifier: 0,
      total: 7,
      spec: { count: 2, faces: 6, modifier: 0 },
    };
    render(<AttackResultLine result={dmg} kind="damage" damageType="bludgeoning" />);
    expect(screen.getByText("7")).toBeInTheDocument();
    // No "+ 0" / "− 0" noise.
    expect(screen.queryByText(/[+−]\s*0/)).not.toBeInTheDocument();
  });

  it("renders a negative modifier with a minus sign", () => {
    const dmg: RollResult = {
      dice: [{ value: 5, dropped: false }],
      modifier: -1,
      total: 4,
      spec: { count: 1, faces: 6, modifier: -1 },
    };
    render(<AttackResultLine result={dmg} kind="damage" damageType="slashing" />);
    expect(screen.getByText(/−\s*1/)).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("tags a crit damage roll", () => {
    const crit: RollResult = {
      dice: [
        { value: 6, dropped: false },
        { value: 2, dropped: false },
      ],
      modifier: 3,
      total: 11,
      spec: { count: 2, faces: 12, modifier: 3, crit: true },
    };
    render(<AttackResultLine result={crit} kind="damage" damageType="slashing" />);
    expect(screen.getByText("crit")).toBeInTheDocument();
  });
});
