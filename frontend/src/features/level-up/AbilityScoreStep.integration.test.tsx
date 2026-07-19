import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchFeats, fetchLevelUpPlan, submitLevelUp } from "@/api/client";
import LevelUpCeremony from "@/features/level-up/LevelUpCeremony";
import { axe } from "@/test/axe";
import type { CatalogFeat, Character, LevelUpPlanResponse } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchLevelUpPlan: vi.fn(),
  submitLevelUp: vi.fn(),
  fetchFeats: vi.fn(),
  // HitPointsStep (#887) renders on step 1; it falls back to character.hitDice when reference is empty.
  fetchReference: vi.fn().mockResolvedValue({ races: [], backgrounds: [], alignments: [], artisanTools: [], classes: [] }),
}));
const planMock = vi.mocked(fetchLevelUpPlan);
const submitMock = vi.mocked(submitLevelUp);
const featsMock = vi.mocked(fetchFeats);

const CATALOG: CatalogFeat[] = [
  { id: "alert", name: "Alert", description: "Always on guard.", abilityOptions: [], abilityIncrease: 0, improvements: [] },
];

// hitPoints/hitDice present because step 1 is the real HitPointsStep (#887).
const character = {
  id: "c1",
  classes: [{ id: "entry-1", name: "fighter", level: 7, subclass: "Champion" }],
  abilityScores: { strength: 15, dexterity: 14, constitution: 16, intelligence: 10, wisdom: 12, charisma: 8 },
  skills: [{ name: "athletics", ability: "strength", proficient: true }],
  hitPoints: { current: 52, max: 52 },
  hitDice: { die: "d10", total: 7 },
} as unknown as Character;

const plan: LevelUpPlanResponse = {
  target: { className: "fighter", subclass: "Champion", newLevel: 8, isPrimary: true },
  steps: [{ kind: "hitPoints" }, { kind: "advancement", count: 1 }, { kind: "review" }],
};

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
  planMock.mockResolvedValue(plan);
  featsMock.mockResolvedValue(CATALOG);
});

describe("AbilityScoreStep in the ceremony", () => {
  it("gates Continue on the advancement step until two points are assigned, then submits the ASI op", async () => {
    submitMock.mockResolvedValue({ id: "c1" } as Character);
    const user = userEvent.setup();
    renderCeremony();

    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /take average/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // On the advancement step, Continue is blocked until the ASI is complete.
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /increase constitution/i }));
    await user.click(screen.getByRole("button", { name: /increase constitution/i }));

    const cont = screen.getByRole("button", { name: /continue/i });
    await waitFor(() => expect(cont).toBeEnabled());
    await user.click(cont);
    await user.click(screen.getByRole("button", { name: /confirm level up/i }));

    await waitFor(() => expect(screen.getByText("SHEET")).toBeInTheDocument());
    expect(submitMock).toHaveBeenCalledWith("c1", {
      target: { kind: "existing", classEntryId: "entry-1" },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "constitution", amount: 2 }] },
    });
  });

  it("has no axe violations on either advancement branch", async () => {
    const user = userEvent.setup();
    const { container } = renderCeremony();

    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /take average/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: /take a feat/i }));
    await screen.findByPlaceholderText(/filter feats/i);
    expect(await axe(container)).toHaveNoViolations();
  });
});
