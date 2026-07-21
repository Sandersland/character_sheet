import { useEffect, useRef, useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fetchReference } from "@/api/client";
import { DiceRollStyleProvider } from "@/features/dice/DiceRollStyleProvider";
import HitPointsStep from "@/features/level-up/HitPointsStep";
import { LevelUpStepContext, type LevelUpStepContextValue } from "@/features/level-up/useLevelUpStepContext";
import type { RollResult } from "@/lib/dice";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import type { Character, LevelUpPlanResponse, LevelUpTarget, ReferenceData } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchReference: vi.fn() }));

// Stub the 3D roller: fires onResult only when its "settle" button is clicked
// (not on mount), so tests can observe the tumbling gap before a roll settles.
// Each mount's settle value is distinct, so a forbidden re-roll (a second
// mount) is observably different from the first.
const ROLL_VALUES = [7, 3];
let rollMountCount = 0;
vi.mock("@/features/dice/DiceRoller", () => ({
  default: function MockDiceRoller({ onResult }: { onResult?: (r: RollResult) => void }) {
    const ordinalRef = useRef(0);
    useEffect(() => {
      ordinalRef.current = rollMountCount;
      rollMountCount += 1;
    }, []);
    function handleSettle() {
      const value = ROLL_VALUES[Math.min(ordinalRef.current, ROLL_VALUES.length - 1)];
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

const fetchReferenceMock = vi.mocked(fetchReference);

const EMPTY_REFERENCE = {
  races: [],
  classes: [],
  backgrounds: [],
  alignments: [],
  artisanTools: [],
} as unknown as ReferenceData;

const baseCharacter = {
  id: "c1",
  classes: [{ id: "entry-1", name: "fighter", level: 7, subclass: "Champion" }],
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  hitPoints: { current: 52, max: 52, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 7, die: "d10", spent: 0 },
} as unknown as Character;

const FIGHTER_ENTRY_TARGET: LevelUpTarget = { kind: "existing", classEntryId: "entry-1" };

const multiCharacter = {
  ...baseCharacter,
  classes: [
    { id: "entry-1", name: "fighter", level: 7, subclass: "Champion" },
    { id: "entry-2", name: "wizard", level: 3, subclass: null },
  ],
} as unknown as Character;

// Two classes with different hit dice so a target switch visibly changes the die.
const MULTICLASS_REFERENCE = {
  races: [],
  backgrounds: [],
  alignments: [],
  artisanTools: [],
  classes: [
    { id: "cls-fighter", name: "fighter", hitDie: "d10" },
    { id: "cls-wizard", name: "wizard", hitDie: "d6" },
  ],
} as unknown as ReferenceData;

const basePlan = {
  target: { className: "fighter", subclass: "Champion", newLevel: 8, isPrimary: true },
  steps: [{ kind: "hitPoints" }],
} as LevelUpPlanResponse;

function renderStep(over?: { draft?: LevelUpDraft; character?: Character; target?: LevelUpTarget }) {
  const setDraft = vi.fn();
  const value: LevelUpStepContextValue = {
    character: over?.character ?? baseCharacter,
    draft: over?.draft ?? {},
    setDraft,
    plan: basePlan,
    target: over?.target ?? FIGHTER_ENTRY_TARGET,
  };
  render(
    <LevelUpStepContext.Provider value={value}>
      <HitPointsStep />
    </LevelUpStepContext.Provider>,
  );
  return { setDraft };
}

// Stateful host so card clicks and dice results flow through a real setDraft.
function StatefulStep({
  onDraft,
  character = baseCharacter,
  target = FIGHTER_ENTRY_TARGET,
}: {
  onDraft?: (d: LevelUpDraft) => void;
  character?: Character;
  target?: LevelUpTarget;
}) {
  const [draft, setDraft] = useState<LevelUpDraft>({});
  useEffect(() => {
    onDraft?.(draft);
  }, [draft, onDraft]);
  const value: LevelUpStepContextValue = { character, draft, setDraft, plan: basePlan, target };
  return (
    <LevelUpStepContext.Provider value={value}>
      <HitPointsStep />
    </LevelUpStepContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  rollMountCount = 0;
  localStorage.clear();
  fetchReferenceMock.mockResolvedValue(EMPTY_REFERENCE);
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

  // #1170: which class advances is now decided upstream by the ceremony's
  // class-choice step — HitPointsStep just follows whatever `target` it's given.
  it("follows an existing multiclass entry's die, distinct from the character's own hitDice.die", async () => {
    fetchReferenceMock.mockResolvedValue(MULTICLASS_REFERENCE);
    renderStep({ character: multiCharacter, target: { kind: "existing", classEntryId: "entry-2" } });

    expect(await screen.findByRole("button", { name: /roll 1d6/i })).toBeInTheDocument();
  });

  it("follows a brand-new multiclass target's die (adding a class via the ceremony)", async () => {
    fetchReferenceMock.mockResolvedValue(MULTICLASS_REFERENCE);
    renderStep({ target: { kind: "new", classId: "cls-wizard" } });

    expect(await screen.findByRole("button", { name: /roll 1d6/i })).toBeInTheDocument();
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
