import { useEffect, useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { fetchReference } from "@/api/client";
import HitPointsStep from "@/features/level-up/HitPointsStep";
import { LevelUpStepContext, type LevelUpStepContextValue } from "@/features/level-up/useLevelUpStepContext";
import type { RollResult } from "@/lib/dice";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import type { Character, LevelUpPlanResponse, ReferenceData } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchReference: vi.fn() }));

// Stub the 3D roller: each mount fires onResult once with a distinct value, so a
// second mount (a forbidden re-roll) is observably different from the first.
const ROLL_VALUES = [7, 3];
let rollMountCount = 0;
vi.mock("@/features/dice/DiceRoller", () => ({
  default: function MockDiceRoller({ onResult }: { onResult?: (r: RollResult) => void }) {
    useEffect(() => {
      const value = ROLL_VALUES[Math.min(rollMountCount, ROLL_VALUES.length - 1)];
      rollMountCount += 1;
      onResult?.({ dice: [{ value, dropped: false }], modifier: 0, total: value, spec: { count: 1, faces: 10 } });
      // eslint-disable-next-line react-hooks/exhaustive-deps -- mock fires onResult once on mount; empty deps intentional
    }, []);
    return <div data-testid="dice-roller" />;
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

// Stateful host so card clicks and dice results flow through a real setDraft.
function StatefulStep({ onDraft }: { onDraft?: (d: LevelUpDraft) => void }) {
  const [draft, setDraft] = useState<LevelUpDraft>({});
  useEffect(() => {
    onDraft?.(draft);
  }, [draft, onDraft]);
  const value: LevelUpStepContextValue = { character: baseCharacter, draft, setDraft, plan: basePlan };
  return (
    <MemoryRouter initialEntries={["/characters/c1/level-up"]}>
      <LevelUpStepContext.Provider value={value}>
        <HitPointsStep />
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

    expect(await screen.findByText(/52\s*→\s*59/)).toBeInTheDocument();
    expect(lastDraft).toEqual({ hp: { method: "roll", roll: 7 } });
  });

  it("holds the rolled value across an average↔roll toggle (no re-roll fishing)", async () => {
    render(<StatefulStep />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /roll 1d10/i }));
    expect(await screen.findByText(/52\s*→\s*59/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /take average/i }));
    expect(await screen.findByText(/52\s*→\s*58/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /roll 1d10/i }));
    // Still 59 (the held 7), not 55 (a fresh mount's 3) — the die never re-rolled.
    expect(await screen.findByText(/52\s*→\s*59/)).toBeInTheDocument();
    expect(rollMountCount).toBe(1);
  });
});
