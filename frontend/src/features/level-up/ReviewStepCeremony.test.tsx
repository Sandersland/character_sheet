import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchLevelUpPlan, submitLevelUp } from "@/api/client";
import LevelUpCeremony from "@/features/level-up/LevelUpCeremony";
import type { Character, LevelUpPlanResponse } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchLevelUpPlan: vi.fn(),
  submitLevelUp: vi.fn(),
  fetchFeats: vi.fn().mockResolvedValue([]),
  fetchManeuvers: vi.fn().mockResolvedValue([]),
  fetchDisciplines: vi.fn().mockResolvedValue([]),
  fetchSpells: vi.fn().mockResolvedValue([]),
  fetchReference: vi.fn().mockResolvedValue({ races: [], backgrounds: [], alignments: [], artisanTools: [], classes: [] }),
}));

const planMock = vi.mocked(fetchLevelUpPlan);
const submitMock = vi.mocked(submitLevelUp);

// hitPoints/hitDice/abilityScores present because step 1 is the real HitPointsStep.
const character = {
  id: "c1",
  classes: [{ id: "entry-1", name: "fighter", level: 7, subclass: "Champion" }],
  abilityScores: { strength: 15, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 12, charisma: 8 },
  skills: [{ name: "athletics", ability: "strength", proficient: true }],
  hitPoints: { current: 40, max: 40 },
  hitDice: { die: "d10", total: 7 },
  level: 7,
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

// Drives hitPoints (take average) → advancement (+2 Strength) → review.
async function walkToReview(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /take average/i }));
  await user.click(screen.getByRole("button", { name: /continue/i }));

  await user.click(screen.getByRole("button", { name: /increase strength/i }));
  await user.click(screen.getByRole("button", { name: /increase strength/i }));
  const cont = screen.getByRole("button", { name: /continue/i });
  await waitFor(() => expect(cont).toBeEnabled());
  await user.click(cont);
}

beforeEach(() => {
  vi.clearAllMocks();
  planMock.mockResolvedValue(plan);
});

describe("ReviewStep in the ceremony", () => {
  it("shows a ledger reflecting the draft, then Confirm submits it and navigates to the sheet", async () => {
    submitMock.mockResolvedValue({ id: "c1" } as Character);
    const user = userEvent.setup();
    renderCeremony();

    await walkToReview(user);

    // The review ledger mirrors the staged draft.
    expect(await screen.findByText("Confirm your advancement")).toBeInTheDocument();
    expect(screen.getByText("Level")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    // Con 14 (+2), d10 average = 8; max 40 → 48.
    expect(screen.getByText("48")).toBeInTheDocument();
    // ASI resolved through abilityLabel, never a raw key.
    expect(screen.getByText("Strength")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /confirm level up/i }));

    await waitFor(() => expect(screen.getByText("SHEET")).toBeInTheDocument());
    expect(submitMock).toHaveBeenCalledWith("c1", {
      target: { kind: "existing", classEntryId: "entry-1" },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
    });
  });

  it("keeps the ceremony open and surfaces a single error when the submit is rejected", async () => {
    submitMock.mockRejectedValue(new Error("The scribe spilled ink."));
    const user = userEvent.setup();
    renderCeremony();

    await walkToReview(user);
    await user.click(await screen.findByRole("button", { name: /confirm level up/i }));

    // The shell owns the error surface; the review body must not render its own copy.
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The scribe spilled ink."));
    expect(screen.getAllByText("The scribe spilled ink.")).toHaveLength(1);
    // Still on the review step — no navigation to the sheet.
    expect(screen.getByText("Confirm your advancement")).toBeInTheDocument();
    expect(screen.queryByText("SHEET")).not.toBeInTheDocument();
  });
});
