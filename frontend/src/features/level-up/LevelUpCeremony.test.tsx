import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { fetchLevelUpPlan, fetchReference, submitLevelUp } from "@/api/client";
import LevelUpCeremony from "@/features/level-up/LevelUpCeremony";
import { axe } from "@/test/axe";
import type { Character, LevelUpPlanResponse, LevelUpStep, ReferenceData } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchLevelUpPlan: vi.fn(), fetchReference: vi.fn(), submitLevelUp: vi.fn() }));

const planMock = vi.mocked(fetchLevelUpPlan);
const referenceMock = vi.mocked(fetchReference);
const submitMock = vi.mocked(submitLevelUp);

const character = {
  id: "c1",
  pendingLevelUps: 1,
  classes: [{ id: "entry-1", name: "fighter", level: 7, subclass: "Champion" }],
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  hitPoints: { current: 52, max: 52, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 7, die: "d10", spent: 0 },
} as unknown as Character;

function plan(steps: LevelUpStep[], target?: Partial<LevelUpPlanResponse["target"]>): LevelUpPlanResponse {
  return {
    target: { className: "fighter", subclass: "Champion", newLevel: 8, isPrimary: true, ...target },
    steps,
  };
}

function renderCeremony() {
  return render(
    <MemoryRouter initialEntries={["/characters/c1/level-up"]}>
      <Routes>
        <Route path="/characters/:id/level-up" element={<LevelUpCeremony character={character} />} />
        <Route path="/characters/:id" element={<div>SHEET</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  referenceMock.mockResolvedValue({
    races: [],
    classes: [],
    backgrounds: [],
    alignments: [],
    artisanTools: [],
  } as unknown as ReferenceData);
});

describe("LevelUpCeremony", () => {
  it("renders the plan's rail, the level transition, and the step kicker", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "advancement", count: 1 }, { kind: "review" }]));
    renderCeremony();

    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.getAttribute("aria-label"))).toEqual([
      "Step 1: Hit Points",
      "Step 2: Ability Score / Feat",
      "Step 3: Review",
    ]);
    expect(screen.getByText(/fighter · Champion/i)).toBeInTheDocument();
    // "Level 7 → 8" is split across spans — anchor on the heading.
    expect(screen.getByRole("heading", { name: /Level\s*7\s*→\s*8/ })).toBeInTheDocument();
  });

  it("Continue advances, then disables on a step the draft can't satisfy; Back returns", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "advancement", count: 1 }, { kind: "review" }]));
    renderCeremony();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
    // Continue is disabled until the HP step records a choice.
    const cont = screen.getByRole("button", { name: /continue/i });
    expect(cont).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /take average/i }));
    expect(cont).toBeEnabled();
    await user.click(cont);

    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    // The placeholder can't satisfy the advancement step — Continue disables.
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  });

  it("Cancel returns to the sheet without submitting", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }]));
    renderCeremony();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 1 of 2")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("SHEET")).toBeInTheDocument();
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("Confirm on the last step submits and navigates to the sheet", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }]));
    submitMock.mockResolvedValue({ id: "c1" } as Character);
    renderCeremony();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 1 of 2")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /take average/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /confirm level up/i }));

    await waitFor(() => expect(screen.getByText("SHEET")).toBeInTheDocument());
    expect(submitMock).toHaveBeenCalledWith("c1", {
      target: { kind: "existing", classEntryId: "entry-1" },
      hp: { method: "average" },
    });
  });

  it("renders a rejected submission's error inline and stays in the ceremony", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }]));
    submitMock.mockRejectedValue(new Error("this level-up requires choosing a subclass"));
    renderCeremony();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 1 of 2")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /take average/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /confirm level up/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("this level-up requires choosing a subclass");
    expect(screen.queryByText("SHEET")).not.toBeInTheDocument();
  });

  it("renders the #1065 blocked notice (no stepper) for a non-primary resource-backed plan", async () => {
    planMock.mockResolvedValue(
      plan([{ kind: "hitPoints" }, { kind: "maneuvers", count: 2 }, { kind: "review" }], {
        isPrimary: false,
        subclass: "Battle Master",
      }),
    );
    renderCeremony();
    const user = userEvent.setup();

    expect(await screen.findByText(/can't be resolved for a non-primary class yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /back to sheet/i }));
    expect(screen.getByText("SHEET")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "advancement", count: 1 }, { kind: "review" }]));
    const { container } = renderCeremony();
    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
    expect(await axe(container)).toHaveNoViolations();
  });
});
