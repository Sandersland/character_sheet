import { useEffect, useRef, useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useSearchParams } from "react-router-dom";

import { fetchReference } from "@/api/client";
import HitPointsStep from "@/features/level-up/HitPointsStep";
import { LevelUpStepContext, type LevelUpStepContextValue } from "@/features/level-up/useLevelUpStepContext";
import type { RollResult } from "@/lib/dice";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import type { Character, LevelUpPlanResponse, ReferenceData } from "@/types/character";

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

const multiCharacter = {
  ...baseCharacter,
  classes: [
    { id: "entry-1", name: "fighter", level: 7, subclass: "Champion" },
    { id: "entry-2", name: "wizard", level: 3, subclass: null },
  ],
} as unknown as Character;

// Two classes with different hit dice so a class switch visibly changes the die.
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

function renderStep(over?: { draft?: LevelUpDraft; character?: Character; url?: string }) {
  const setDraft = vi.fn();
  const value: LevelUpStepContextValue = {
    character: over?.character ?? baseCharacter,
    draft: over?.draft ?? {},
    setDraft,
    plan: basePlan,
  };
  render(
    <MemoryRouter initialEntries={[over?.url ?? "/characters/c1/level-up"]}>
      <LevelUpStepContext.Provider value={value}>
        <HitPointsStep />
      </LevelUpStepContext.Provider>
    </MemoryRouter>,
  );
  return { setDraft };
}

function LocationSearch() {
  const [sp] = useSearchParams();
  return <div data-testid="search">{sp.toString()}</div>;
}

// Stateful host so card clicks and dice results flow through a real setDraft.
function StatefulStep({
  onDraft,
  character = baseCharacter,
}: {
  onDraft?: (d: LevelUpDraft) => void;
  character?: Character;
}) {
  const [draft, setDraft] = useState<LevelUpDraft>({});
  useEffect(() => {
    onDraft?.(draft);
  }, [draft, onDraft]);
  const value: LevelUpStepContextValue = { character, draft, setDraft, plan: basePlan };
  return (
    <MemoryRouter initialEntries={["/characters/c1/level-up"]}>
      <LevelUpStepContext.Provider value={value}>
        <HitPointsStep />
        <LocationSearch />
      </LevelUpStepContext.Provider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  rollMountCount = 0;
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

  it("shows no advancing-class selector for a single-class character", async () => {
    renderStep();

    expect(screen.queryByText(/which class advances/i)).not.toBeInTheDocument();
  });

  it("renders the advancing-class selector for a multiclass character", async () => {
    renderStep({ character: multiCharacter });

    expect(await screen.findByText(/which class advances/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /fighter 7 → 8/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /wizard 3 → 4/i })).toBeInTheDocument();
  });

  it("switching the advancing class updates ?entry=, the die, and the preview", async () => {
    fetchReferenceMock.mockResolvedValue(MULTICLASS_REFERENCE);
    render(<StatefulStep character={multiCharacter} />);
    const user = userEvent.setup();

    // Default is the primary (fighter, d10). Settle its die first.
    await user.click(screen.getByRole("button", { name: /roll 1d10/i }));
    await user.click(screen.getByTestId("settle"));
    expect(await screen.findByText(/52\s*→\s*59/)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /wizard 3 → 4/i }));
    expect(screen.getByTestId("search")).toHaveTextContent("entry=entry-2");

    // The die-swap forces the one legitimate remount (key={math.faces}) so the
    // wizard's d6 gets a fresh reveal instead of carrying the fighter's roll.
    expect(rollMountCount).toBe(2);

    // The die follows the wizard's d6; average now previews 52 → 56 (+4).
    expect(await screen.findByRole("button", { name: /roll 1d6/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /take average/i }));
    expect(await screen.findByText(/52\s*→\s*56/)).toBeInTheDocument();
  });
});
