import { useEffect, useRef, useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DiceRollStyleProvider } from "@/features/dice/DiceRollStyleProvider";
import HitPointsStep from "@/features/level-up/HitPointsStep";
import { LevelUpStepContext, type LevelUpStepContextValue } from "@/features/level-up/useLevelUpStepContext";
import type { RollResult } from "@/lib/dice";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import type { Character, LevelUpPlanResponse, LevelUpStep, LevelUpTarget } from "@/types/character";

// Stub the 3D roller: fires onResult only when its "settle" button is clicked
// (not on mount), so tests can observe the tumbling gap before a roll settles.
// Each mount's settle value is distinct, so a forbidden re-roll (a second
// mount) is observably different from the first.
let rollValues = [7, 3];
let rollMountCount = 0;
vi.mock("@/features/dice/DiceRoller", () => ({
  default: function MockDiceRoller({ onResult }: { onResult?: (r: RollResult) => void }) {
    const ordinalRef = useRef(0);
    useEffect(() => {
      ordinalRef.current = rollMountCount;
      rollMountCount += 1;
    }, []);
    function handleSettle() {
      const value = rollValues[Math.min(ordinalRef.current, rollValues.length - 1)];
      onResult?.({ dice: [{ value, dropped: false }], modifier: 0, total: value, spec: { count: 1, faces: 10 } });
    }
    return (
      <div data-testid="dice-roller">
        <button type="button" data-testid="settle" onClick={handleSettle}>
          Settle
        </button>
      </div>
    );
  },
}));

// The step's numbers arrive resolved on the wire (#1380) — these fixtures are
// what the backend planner serves, not something the component re-derives.
const D10_CON_0: LevelUpStep = {
  kind: "hitPoints",
  meta: { die: "d10", faces: 10, conMod: 0, fixedAverage: 6, averageGain: 6, minRoll: 1, maxRoll: 10 },
};
const D6_CON_0: LevelUpStep = {
  kind: "hitPoints",
  meta: { die: "d6", faces: 6, conMod: 0, fixedAverage: 4, averageGain: 4, minRoll: 1, maxRoll: 6 },
};
// Con 1 → −5: every gain is pinned to the max(1, …) level-up floor.
const D6_CON_MINUS_5: LevelUpStep = {
  kind: "hitPoints",
  meta: { die: "d6", faces: 6, conMod: -5, fixedAverage: 4, averageGain: 1, minRoll: 1, maxRoll: 1 },
};

const baseCharacter = {
  id: "c1",
  rulesEdition: "EDITION_2024",
  classes: [{ id: "entry-1", name: "fighter", level: 7, subclass: "Champion" }],
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  hitPoints: { current: 52, max: 52, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 7, die: "d10", spent: 0 },
} as unknown as Character;

const FIGHTER_ENTRY_TARGET: LevelUpTarget = { kind: "existing", classEntryId: "entry-1" };

function planFor(step: LevelUpStep): LevelUpPlanResponse {
  return {
    target: { className: "fighter", subclass: "Champion", newLevel: 8, isPrimary: true },
    steps: [step],
  } as LevelUpPlanResponse;
}

function renderStep(over?: { draft?: LevelUpDraft; character?: Character; step?: LevelUpStep }) {
  const setDraft = vi.fn();
  const step = over?.step ?? D10_CON_0;
  const value: LevelUpStepContextValue = {
    character: over?.character ?? baseCharacter,
    draft: over?.draft ?? {},
    setDraft,
    plan: planFor(step),
    target: FIGHTER_ENTRY_TARGET,
  };
  render(
    <LevelUpStepContext.Provider value={value}>
      <HitPointsStep step={step} />
    </LevelUpStepContext.Provider>,
  );
  return { setDraft };
}

// Stateful host so card clicks and dice results flow through a real setDraft.
function StatefulStep({
  onDraft,
  character = baseCharacter,
  step = D10_CON_0,
}: {
  onDraft?: (d: LevelUpDraft) => void;
  character?: Character;
  step?: LevelUpStep;
}) {
  const [draft, setDraft] = useState<LevelUpDraft>({});
  useEffect(() => {
    onDraft?.(draft);
  }, [draft, onDraft]);
  const value: LevelUpStepContextValue = { character, draft, setDraft, plan: planFor(step), target: FIGHTER_ENTRY_TARGET };
  return (
    <LevelUpStepContext.Provider value={value}>
      <HitPointsStep step={step} />
    </LevelUpStepContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  rollValues = [7, 3];
  rollMountCount = 0;
  localStorage.clear();
});

describe("HitPointsStep", () => {
  it("writes an average hp op when the Take average card is chosen", async () => {
    const { setDraft } = renderStep();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /take average/i }));

    expect(setDraft).toHaveBeenCalledTimes(1);
    const updater = setDraft.mock.calls[0][0] as (d: LevelUpDraft) => LevelUpDraft;
    expect(updater({})).toEqual({ hp: { method: "average" } });
  });

  it("previews the new maximum HP for the average path (d10, +0 Con: 52 → 58)", async () => {
    renderStep({ draft: { hp: { method: "average" } } });

    expect(await screen.findByText(/52\s*→\s*58/)).toBeInTheDocument();
  });

  it("rolls the hit die, writing a roll op and previewing the new max (52 → 59)", async () => {
    let lastDraft: LevelUpDraft = {};
    render(<StatefulStep onDraft={(d) => (lastDraft = d)} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /roll 1d10/i }));
    await user.click(screen.getByTestId("settle"));

    expect(await screen.findByText(/52\s*→\s*59/)).toBeInTheDocument();
    expect(lastDraft).toEqual({ hp: { method: "roll", roll: 7 } });
  });

  it("keeps the settled die mounted with the result text", async () => {
    render(<StatefulStep />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /roll 1d10/i }));
    await user.click(screen.getByTestId("settle"));

    expect(await screen.findByText(/52\s*→\s*59/)).toBeInTheDocument();
    expect(screen.getByTestId("dice-roller")).toBeInTheDocument();
  });

  it("reserves result-line space while tumbling", async () => {
    render(<StatefulStep />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /roll 1d10/i }));

    const resultLine = screen.getByText(/new maximum hp/i).closest("p");
    expect(resultLine).toHaveClass("invisible");
  });

  it("holds the rolled value across an average↔roll toggle (no re-roll fishing)", async () => {
    render(<StatefulStep />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /roll 1d10/i }));
    await user.click(screen.getByTestId("settle"));
    expect(await screen.findByText(/52\s*→\s*59/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /take average/i }));
    expect(await screen.findByText(/52\s*→\s*58/)).toBeInTheDocument();
    // The reveal wrapper stays mounted (hidden), not torn down, while average is selected.
    expect(screen.getByTestId("dice-roller").parentElement).toHaveAttribute("hidden");

    await user.click(screen.getByRole("button", { name: /roll 1d10/i }));
    expect(screen.getByTestId("dice-roller").parentElement).not.toHaveAttribute("hidden");
    // Still 59 (the held 7), not 55 (a fresh mount's 3) — the die never re-rolled.
    expect(await screen.findByText(/52\s*→\s*59/)).toBeInTheDocument();
    expect(rollMountCount).toBe(1);
  });

  // #1170 decided WHICH class advances upstream; #1380 moved resolving that
  // class's die to the server, so the step renders the served die and no longer
  // consults the reference catalog or the level-up target at all.
  it("renders the served die even when it differs from the character's persisted one", async () => {
    renderStep({ step: D6_CON_0 });

    expect(await screen.findByRole("button", { name: /roll 1d6/i })).toBeInTheDocument();
    expect(screen.getByText(/you gain 1d6/i)).toBeInTheDocument();
  });

  it("reads every number off the plan step, fetching nothing (#1380)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderStep({ draft: { hp: { method: "average" } } });

    expect(await screen.findByText(/52\s*→\s*58/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // The preview used to add conMod unclamped while the ledger and the server
  // both floored at 1 — a negative-Con roll of 1 made the two screens disagree.
  it("floors a negative-Con roll at the served minRoll (d6, −5 Con: 52 → 53)", async () => {
    rollValues = [1];
    render(<StatefulStep step={D6_CON_MINUS_5} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /roll 1d6/i }));
    await user.click(screen.getByTestId("settle"));

    expect(await screen.findByText(/52\s*→\s*53/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /roll 1d6/i })).toHaveTextContent("+1");
  });

  it("quick dice-roll preference bypasses the 3D die entirely", async () => {
    localStorage.setItem("cs:pref:diceRoll", "quick");
    render(
      <DiceRollStyleProvider>
        <StatefulStep />
      </DiceRollStyleProvider>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /roll 1d10/i }));

    expect(await screen.findByText(/new maximum hp/i)).toBeInTheDocument();
    expect(screen.queryByTestId("dice-roller")).not.toBeInTheDocument();
  });
});
