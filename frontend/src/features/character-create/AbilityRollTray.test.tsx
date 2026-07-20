import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AbilityRollTray from "@/features/character-create/AbilityRollTray";
import AbilityAssignmentPanel from "@/features/character-create/AbilityAssignmentPanel";
import { EMPTY_ASSIGNMENTS } from "@/lib/abilityAssignment";
import { rollAbilityScoreSet } from "@/lib/abilityGen";
import { DiceRollStyleProvider } from "@/features/dice/DiceRollStyleProvider";
import type { CreationBackgroundBonuses } from "@/lib/characterCreation";
import type { RollResult } from "@/lib/dice";
import type { AbilityScores } from "@/types/character";

// The physics roller mounts a Three.js canvas that won't render in jsdom — mock
// it to fire a fixed d-total whenever its rollKey changes, driving the sequence.
vi.mock("@/features/dice/PhysicsDiceRoller", () => ({
  default: function MockPhysicsRoller({
    onResult,
    rollKey,
  }: {
    onResult?: (r: RollResult) => void;
    rollKey?: number | string;
  }) {
    useEffect(() => {
      onResult?.({
        dice: [{ value: 4, dropped: false }],
        modifier: 0,
        total: 12,
        spec: { count: 4, faces: 6 },
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per rollKey; onResult identity churns each render and would loop
    }, [rollKey]);
    return <div data-testid="physics-die" />;
  },
}));

vi.mock("@/lib/abilityGen", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/abilityGen")>();
  return { ...actual, rollAbilityScoreSet: vi.fn(() => [15, 14, 13, 12, 10, 8]) };
});

const mockRollSet = vi.mocked(rollAbilityScoreSet);

beforeEach(() => {
  localStorage.clear();
  mockRollSet.mockClear();
});

describe("AbilityRollTray", () => {
  it("shows Roll scores with no pool and Reroll all once rolled", () => {
    const { rerender } = render(
      <DiceRollStyleProvider>
        <AbilityRollTray pool={null} hasAssignments={false} onRolled={vi.fn()} />
      </DiceRollStyleProvider>,
    );
    expect(screen.getByRole("button", { name: "Roll scores" })).toBeInTheDocument();

    rerender(
      <DiceRollStyleProvider>
        <AbilityRollTray pool={[15, 14, 13, 12, 10, 8]} hasAssignments={false} onRolled={vi.fn()} />
      </DiceRollStyleProvider>,
    );
    expect(screen.getByRole("button", { name: "Reroll all" })).toBeInTheDocument();
  });

  it("hides the roll button once any slot is assigned", () => {
    render(
      <DiceRollStyleProvider>
        <AbilityRollTray pool={[15, 14, 13, 12, 10, 8]} hasAssignments onRolled={vi.fn()} />
      </DiceRollStyleProvider>,
    );
    expect(screen.queryByRole("button", { name: /Roll/ })).toBeNull();
  });

  it("quick preference fills the pool synchronously without a dice tray", async () => {
    localStorage.setItem("cs:pref:diceRoll", "quick");
    const user = userEvent.setup();
    const onRolled = vi.fn();
    render(
      <DiceRollStyleProvider>
        <AbilityRollTray pool={null} hasAssignments={false} onRolled={onRolled} />
      </DiceRollStyleProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Roll scores" }));
    expect(onRolled).toHaveBeenCalledWith([15, 14, 13, 12, 10, 8]);
    expect(screen.queryByTestId("physics-die")).toBeNull();
  });

  it("animated preference plays the dice sequence, then reports six totals", async () => {
    const user = userEvent.setup();
    const onRolled = vi.fn();
    render(
      <DiceRollStyleProvider>
        <AbilityRollTray pool={null} hasAssignments={false} onRolled={onRolled} />
      </DiceRollStyleProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Roll scores" }));
    // The physics stage mounts once a roll is in flight.
    expect(screen.getByTestId("physics-die")).toBeInTheDocument();
    // Cascade the six sets instantly via the sequence's Skip control.
    await user.click(screen.getByRole("button", { name: "Skip" }));
    await waitFor(() => expect(onRolled).toHaveBeenCalledTimes(1));
    expect(onRolled.mock.calls[0][0]).toEqual([12, 12, 12, 12, 12, 12]);
    expect(mockRollSet).not.toHaveBeenCalled();
  });
});

const ALL_EIGHT: AbilityScores = {
  strength: 8,
  dexterity: 8,
  constitution: 8,
  intelligence: 8,
  wisdom: 8,
  charisma: 8,
};

const INERT: CreationBackgroundBonuses = {
  applicable: false,
  abilities: [],
  originFeat: null,
  assignment: {},
  complete: false,
};

describe("AbilityAssignmentPanel — roll mode", () => {
  it("shows the roll tray and leaves rows unassignable until a pool exists", () => {
    render(
      <DiceRollStyleProvider>
        <AbilityAssignmentPanel
          method="roll"
          pool={null}
          assignments={EMPTY_ASSIGNMENTS}
          scores={ALL_EIGHT}
          bonuses={INERT}
          primaryAbility={[]}
          className=""
          update={vi.fn()}
        />
      </DiceRollStyleProvider>,
    );
    expect(screen.getByRole("button", { name: "Roll scores" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assign to Strength" })).toBeDisabled();
  });
});
