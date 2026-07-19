import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fetchReference } from "@/api/client";
import SubclassStep from "@/features/level-up/SubclassStep";
import { LevelUpStepContext, type LevelUpStepContextValue } from "@/features/level-up/useLevelUpStepContext";
import { axe } from "@/test/axe";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import type { Character, LevelUpPlanResponse, ReferenceData } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchReference: vi.fn() }));
const refMock = vi.mocked(fetchReference);

const fighterReference = {
  races: [],
  backgrounds: [],
  alignments: [],
  artisanTools: [],
  classes: [
    {
      name: "Fighter",
      subclasses: [
        { id: "bm", name: "Battle Master", description: "Learn combat maneuvers fueled by superiority dice." },
        { id: "champ", name: "Champion", description: "Improved critical hits and raw physical prowess." },
        { id: "ek", name: "Eldritch Knight", description: "Blend martial skill with wizard spells." },
      ],
    },
  ],
} as unknown as ReferenceData;

const plan: LevelUpPlanResponse = {
  target: { className: "Fighter", subclass: null, newLevel: 3, isPrimary: true },
  steps: [{ kind: "subclass" }],
  grantedSpells: [],
};

// Live harness: a real useState draft so aria-checked reflects clicks. Pass a
// `setDraft` spy to instead pin the draft and assert the updater in isolation.
function renderStep({ draft: initial, setDraft }: { draft?: LevelUpDraft; setDraft?: LevelUpStepContextValue["setDraft"] } = {}) {
  const seed = initial ?? { hp: { method: "average" } };
  function Harness() {
    const [liveDraft, liveSetDraft] = useState<LevelUpDraft>(seed);
    const value: LevelUpStepContextValue = {
      character: { id: "c1" } as Character,
      plan,
      draft: setDraft ? seed : liveDraft,
      setDraft: setDraft ?? liveSetDraft,
    };
    return (
      <LevelUpStepContext.Provider value={value}>
        <SubclassStep />
      </LevelUpStepContext.Provider>
    );
  }
  return render(<Harness />);
}

beforeEach(() => {
  vi.clearAllMocks();
  refMock.mockResolvedValue(fighterReference);
});

describe("SubclassStep", () => {
  it("renders every subclass for the plan's class with its description", async () => {
    renderStep();
    await waitFor(() => expect(screen.getByRole("radio", { name: "Battle Master" })).toBeInTheDocument());
    expect(screen.getByRole("radio", { name: "Champion" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Eldritch Knight" })).toBeInTheDocument();
    expect(screen.getByText(/superiority dice/i)).toBeInTheDocument();
    expect(screen.getByText(/wizard spells/i)).toBeInTheDocument();
  });

  it("writes the picked subclassId to the draft on click", async () => {
    const setDraft = vi.fn();
    renderStep({ draft: { hp: { method: "average" } }, setDraft });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("radio", { name: "Battle Master" }));

    expect(setDraft).toHaveBeenCalledTimes(1);
    const updater = setDraft.mock.calls[0][0] as (d: LevelUpDraft) => LevelUpDraft;
    expect(updater({ hp: { method: "average" } })).toMatchObject({ subclassId: "bm" });
  });

  it("reflects the current selection via aria-checked (controlled)", async () => {
    renderStep();
    const user = userEvent.setup();

    const champion = await screen.findByRole("radio", { name: "Champion" });
    expect(champion).toHaveAttribute("aria-checked", "false");

    await user.click(champion);
    expect(screen.getByRole("radio", { name: "Champion" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Battle Master" })).toHaveAttribute("aria-checked", "false");
  });

  it("clears dependent picks when the subclass changes from a prior different pick", async () => {
    const setDraft = vi.fn();
    renderStep({
      draft: { hp: { method: "average" }, subclassId: "ek", maneuvers: [{ maneuverId: "x" }] as never },
      setDraft,
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("radio", { name: "Battle Master" }));

    const updater = setDraft.mock.calls[0][0] as (d: LevelUpDraft) => LevelUpDraft;
    const next = updater({ hp: { method: "average" }, subclassId: "ek", maneuvers: [{ maneuverId: "x" }] as never });
    expect(next.subclassId).toBe("bm");
    expect(next.maneuvers).toBeUndefined();
  });

  it("shows an empty state when the class has no subclasses", async () => {
    refMock.mockResolvedValue({
      races: [],
      backgrounds: [],
      alignments: [],
      artisanTools: [],
      classes: [{ name: "Fighter", subclasses: [] }],
    } as unknown as ReferenceData);
    renderStep();
    expect(await screen.findByText(/no subclasses available/i)).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderStep();
    await screen.findByRole("radio", { name: "Battle Master" });
    expect(await axe(container)).toHaveNoViolations();
  });
});
