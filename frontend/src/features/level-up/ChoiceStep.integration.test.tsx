import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchLevelUpPlan, submitLevelUp } from "@/api/client";
import LevelUpCeremony from "@/features/level-up/LevelUpCeremony";
import type { Character, LevelUpPlanResponse, LevelUpStep } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchLevelUpPlan: vi.fn(),
  submitLevelUp: vi.fn(),
  fetchManeuvers: vi.fn(async () => [
    { id: "m1", name: "Riposte", description: "riposte" },
    { id: "m2", name: "Trip Attack", description: "trip" },
    { id: "m3", name: "Menacing Attack", description: "menace" },
  ]),
  fetchReference: vi.fn(async () => ({ artisanTools: [] })),
  fetchFeats: vi.fn(async () => [
    { id: "archery", name: "Archery", description: "arch", category: "fighting_style" },
    { id: "defense", name: "Defense", description: "def", category: "fighting_style" },
  ]),
}));

const planMock = vi.mocked(fetchLevelUpPlan);
const submitMock = vi.mocked(submitLevelUp);

// hitPoints/hitDice/abilityScores present because step 1 is the real HitPointsStep (#887).
const character = {
  id: "c1",
  pendingLevelUps: 1,
  classes: [{ id: "entry-1", name: "fighter", level: 2, subclass: "Battle Master" }],
  resources: {},
  advancements: [],
  abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
  hitPoints: { current: 20, max: 20 },
  hitDice: { die: "d10", total: 2 },
} as unknown as Character;

function plan(steps: LevelUpStep[]): LevelUpPlanResponse {
  return {
    target: { className: "fighter", subclass: "Battle Master", newLevel: 3, isPrimary: true },
    steps,
    grantedSpells: [],
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
  submitMock.mockResolvedValue({} as Character);
});

describe("ChoiceStep in the ceremony", () => {
  it("gates Continue until exactly 2 maneuvers are chosen, then submits both ops", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "maneuvers", count: 2 }, { kind: "review" }]));
    const user = userEvent.setup();
    renderCeremony();

    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /take average/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // Maneuvers step: real ChoiceStep renders the catalog; Continue stays off.
    expect(await screen.findByText("Riposte")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    await user.click(screen.getByText("Riposte"));
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    await user.click(screen.getByText("Trip Attack"));
    const cont = screen.getByRole("button", { name: /continue/i });
    await waitFor(() => expect(cont).toBeEnabled());

    await user.click(cont);
    await user.click(await screen.findByRole("button", { name: /confirm level up/i }));

    await waitFor(() =>
      expect(submitMock).toHaveBeenCalledWith("c1", {
        target: { kind: "existing", classEntryId: "entry-1" },
        hp: { method: "average" },
        maneuvers: [
          { type: "learnManeuver", maneuverId: "m1" },
          { type: "learnManeuver", maneuverId: "m2" },
        ],
      }),
    );
  });

  it("submits a fighting-style pick as a takeFeat op", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "fightingStyleFeat" }, { kind: "review" }]));
    const user = userEvent.setup();
    renderCeremony();

    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /take average/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await user.click(await screen.findByText("Archery"));
    const cont = screen.getByRole("button", { name: /continue/i });
    await waitFor(() => expect(cont).toBeEnabled());
    await user.click(cont);
    await user.click(await screen.findByRole("button", { name: /confirm level up/i }));

    await waitFor(() =>
      expect(submitMock).toHaveBeenCalledWith("c1", {
        target: { kind: "existing", classEntryId: "entry-1" },
        hp: { method: "average" },
        fightingStyleFeat: { type: "takeFeat", featId: "archery", slot: "fightingStyle" },
      }),
    );
  });
});
